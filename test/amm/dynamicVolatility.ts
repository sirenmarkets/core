import { time, expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract } from "hardhat"

import {
  SimpleTokenContract,
  MockPriceOracleInstance,
  PriceOracleInstance,
  MockVolatilityOracleInstance,
  SimpleTokenInstance,
  MinterAmmInstance,
  SeriesControllerInstance,
  ERC1155ControllerInstance,
  AddressesProviderInstance,
  AmmDataProviderInstance,
  WTokenVaultInstance,
} from "../../typechain"

import {
  assertBNEq,
  setupAllTestContracts,
  ONE_WEEK_DURATION,
  setNextBlockTimestamp,
  mineBlock,
  ONE_DAY_DURATION,
} from "../util"

let deployedSeriesController: SeriesControllerInstance
let deployedERC1155Controller: ERC1155ControllerInstance
let deployedAmm: MinterAmmInstance
let deployedMockPriceOracle: MockPriceOracleInstance
let deployedPriceOracle: PriceOracleInstance
let deployedAddressesProvider: AddressesProviderInstance
let deployedAmmDataProvider: AmmDataProviderInstance
let deployedWTokenVault: WTokenVaultInstance
let deployedMockVolatilityOracle: MockVolatilityOracleInstance

let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance
let collateralToken: SimpleTokenInstance
let lpToken: SimpleTokenInstance

let expiration: number
let seriesId: string

const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const UNDERLYING_PRICE = 14_000 * 10 ** 8
const ANNUALIZED_VOLATILITY = 1 * 1e8 // 100%
const PRICE_TOLERANCE = 1e13

contract("Dynamic Volatility", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  context("calls", async () => {
    beforeEach(async () => {
      ;({
        underlyingToken,
        collateralToken,
        priceToken,
        deployedAmm,
        seriesId,
        deployedSeriesController,
        deployedERC1155Controller,
        deployedPriceOracle,
        deployedMockPriceOracle,
        deployedAmmDataProvider,
        expiration,
        deployedAddressesProvider,
        deployedMockVolatilityOracle,
        deployedWTokenVault,
        lpToken,
      } = await setupAllTestContracts({
        strikePrice: STRIKE_PRICE.toString(),
        oraclePrice: UNDERLYING_PRICE,
        annualizedVolatility: ANNUALIZED_VOLATILITY,
      }))
    })

    it("Dynamic IV is calculated correctly for calls", async () => {
      // Enable dynamic IV
      await deployedAmm.setAmmConfig((0e18).toString(), true, 14400) // 0 vol bump, 4hr drift rate

      const startTime = expiration - ONE_WEEK_DURATION
      await mineBlock(startTime) // use the same time, no matter when this test gets called

      // Approve collateral
      await collateralToken.mint(ownerAccount, 100e8)
      await collateralToken.approve(deployedAmm.address, 100e8)

      // Provide capital
      let ret = await deployedAmm.provideCapital(100e8, 0)

      const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
      const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

      // Now let's do some trading from another account
      await collateralToken.mint(aliceAccount, 3e8)
      await setNextBlockTimestamp(startTime + 10)
      await collateralToken.approve(deployedAmm.address, 3e8, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "28392151706747857",
        "Price should be correct before trading",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1000000000000000000",
        "Volatility should be correct before trading",
      )

      await setNextBlockTimestamp(startTime + 20)

      // Buy bTokens
      ret = await deployedAmm.bTokenBuy(seriesId, 3e8, 3e8, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "29219953724950714",
        "Price should be correct after trade1",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1016407574921106859",
        "Volatility should be correct after trade1",
      )

      // Approve bTokens to trade for collateral
      await deployedERC1155Controller.setApprovalForAll(
        deployedAmm.address,
        true,
        {
          from: aliceAccount,
        },
      )

      await setNextBlockTimestamp(startTime + 30)

      // Sell bTokens
      ret = await deployedAmm.bTokenSell(seriesId, 3e8, 0, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "28393349920382857",
        "Price should be correct after trade2",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1000038414089868959",
        "Volatility should be correct after trade2",
      )

      await setNextBlockTimestamp(startTime + 40)

      // Buy bTokens
      ret = await deployedAmm.bTokenBuy(seriesId, 3e8, 3e8, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "29220944581886429",
        "Price should be correct after trade3",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1016446366415474219",
        "Volatility should be correct after trade3",
      )

      // Wait for 2 hours
      await mineBlock(startTime + 2 * 3600)

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "28505986415665714",
        "Price should be correct after 2hr wait",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1008268867558891205",
        "Volatility should be correct after 2hr wait",
      )

      // Wait another 2 hours
      await mineBlock(startTime + 4 * 3600)
      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "27792468763271429",
        "Price should be correct after 4hr wait",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1000045684351154096",
        "Volatility should be correct after 4hr wait",
      )
    })

    it("Decays to baseline IV in extreme cases", async () => {
      await deployedAmm.setAmmConfig((0e18).toString(), true, 14400) // 0 vol bump, 4hr drift rate

      let checkpoint = expiration - ONE_WEEK_DURATION
      await mineBlock(checkpoint) // use the same time, no matter when this test gets called

      // Approve collateral
      await collateralToken.mint(ownerAccount, 100e8)
      await collateralToken.approve(deployedAmm.address, 100e8)

      // Provide capital
      await deployedAmm.provideCapital(100e8, 0)

      // Now let's do some trading from another account
      await collateralToken.mint(aliceAccount, 1000e8)
      await collateralToken.approve(deployedAmm.address, 1000e8, {
        from: aliceAccount,
      })

      await setNextBlockTimestamp(checkpoint + 20)

      // Buy large amount of bTokens
      await deployedAmm.bTokenBuy(seriesId, 1000e8, 1000e8, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "191913052196903571",
        "Price should be correct after trade1",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "4000000000000000000", // 400% max vol
        "Volatility should be correct after trade1",
      )

      // Wait 2 hours
      checkpoint = checkpoint + 2 * 3600
      await mineBlock(checkpoint)
      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "108781215803875714",
        "Price should be correct after 2hr wait",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "2504166666666666667", // 250%
        "Volatility should be correct after 2hr wait",
      )

      // Wait 4 hours
      checkpoint = checkpoint + 2 * 3600
      await mineBlock(checkpoint)
      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "27997093028271429",
        "Price should be correct after 4hr wait",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1004166666666666667",
        "Volatility should be correct after 4hr wait",
      )

      // Wait 8 hours
      checkpoint = checkpoint + 4 * 3600
      await mineBlock(checkpoint)
      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "27182172210042857",
        "Price should be correct after 8hr wait",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1000000000000000000",
        "Volatility should be correct after 8hr wait",
      )

      // Sell bTokens
      // Approve bTokens to trade for collateral
      await deployedERC1155Controller.setApprovalForAll(
        deployedAmm.address,
        true,
        {
          from: aliceAccount,
        },
      )

      await setNextBlockTimestamp(checkpoint + 10)

      // Sell bTokens
      await deployedAmm.bTokenSell(seriesId, 1000e8, 0, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "5595734308452143",
        "Price should be correct after sell",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "500000000000000000", // min IV 50%
        "Volatility should be correct after sell",
      )

      // Wait 2 hours after sell
      checkpoint = checkpoint + 2 * 3600
      await mineBlock(checkpoint)
      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "15251524481628571",
        "Price should be correct after 2hr wait",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "749652777777777777", // 75%
        "Volatility should be correct after 2hr wait",
      )

      // Wait 4 hours
      checkpoint = checkpoint + 2 * 3600
      await mineBlock(checkpoint)
      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "26551845691140714",
        "Price should be correct after 4hr wait",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "999652777777777777",
        "Volatility should be correct after 4hr wait",
      )
    })

    it("Dynamic IV doesn't affect pool value", async () => {
      await deployedAmm.setAmmConfig((0e18).toString(), true, 14400) // 0 vol bump, 4hr drift rate

      let checkpoint = expiration - ONE_WEEK_DURATION
      await mineBlock(checkpoint) // use the same time, no matter when this test gets called

      // Approve collateral
      await collateralToken.mint(ownerAccount, 100e8)
      await collateralToken.approve(deployedAmm.address, 100e8)

      // Provide capital
      await deployedAmm.provideCapital(100e8, 0)

      // Now let's do some trading from another account
      await collateralToken.mint(aliceAccount, 1000e8)
      await collateralToken.approve(deployedAmm.address, 1000e8, {
        from: aliceAccount,
      })

      await setNextBlockTimestamp(checkpoint + 20)

      // Buy large amount of bTokens
      await deployedAmm.bTokenBuy(seriesId, 1000e8, 1000e8, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "4000000000000000000", // 400% max vol
        "Volatility should be correct after trade1",
      )
      assertBNEq(
        await deployedAmmDataProvider.getTotalPoolValueView(
          deployedAmm.address,
          true,
        ),
        "97193174058",
        "Pool value should be correct after trade",
      )

      // Wait 4 hours
      checkpoint = checkpoint + 4 * 3600
      await mineBlock(checkpoint)
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1004166666666666667",
        "Volatility should be correct after 4hr wait",
      )
      // pool value hasn't changed much even though volatility declined by 300%
      assertBNEq(
        await deployedAmmDataProvider.getTotalPoolValueView(
          deployedAmm.address,
          true,
        ),
        "97253331535",
        "Pool value should be correct after 4hr wait",
      )
    })

    it("It behaves well close to expiration", async () => {
      await deployedAmm.setAmmConfig((0e18).toString(), true, 14400) // 0 vol bump, 4hr drift rate

      let checkpoint = expiration - 4 * 3600 // 4hr before epiry
      await mineBlock(checkpoint) // use the same time, no matter when this test gets called

      // Approve collateral
      await collateralToken.mint(ownerAccount, 100e8)
      await collateralToken.approve(deployedAmm.address, 100e8)

      // Provide capital
      await deployedAmm.provideCapital(100e8, 0)

      // Now let's do some trading from another account
      await collateralToken.mint(aliceAccount, 10e8)
      await setNextBlockTimestamp(checkpoint + 10)
      await collateralToken.approve(deployedAmm.address, 10e8, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "3671615775714",
        "Price should be correct after trade",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1000000000000000000",
        "Volatility should be correct after trade",
      )

      await setNextBlockTimestamp(checkpoint + 20)

      await deployedAmm.bTokenBuy(seriesId, 10e8, 10e8, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "4068349824286",
        "Price should be correct after trade",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1008460716341200462",
        "Volatility should be correct after trade",
      )

      // Wait 1 hour
      checkpoint = checkpoint + 1 * 3600
      await mineBlock(checkpoint)
      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "485759267143",
        "Price should be correct after 1 hour",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1006357288250818681",
        "Volatility should be correct after 1 hour",
      )

      // Sell bTokens
      // Approve bTokens to trade for collateral
      await deployedERC1155Controller.setApprovalForAll(
        deployedAmm.address,
        true,
        {
          from: aliceAccount,
        },
      )

      await setNextBlockTimestamp(checkpoint + 10)

      // Sell bTokens
      await deployedAmm.bTokenSell(seriesId, 10e8, 0, {
        from: aliceAccount,
      })
      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "459073819286",
        "Price should be correct after sell",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1000264930929543718",
        "Volatility should be correct after sell",
      )
    })
  })

  context("puts", async () => {
    beforeEach(async () => {
      ;({
        underlyingToken,
        collateralToken,
        priceToken,
        deployedAmm,
        seriesId,
        deployedSeriesController,
        deployedERC1155Controller,
        deployedPriceOracle,
        deployedMockPriceOracle,
        deployedAmmDataProvider,
        expiration,
        deployedAddressesProvider,
        deployedMockVolatilityOracle,
        deployedWTokenVault,
        lpToken,
      } = await setupAllTestContracts({
        strikePrice: STRIKE_PRICE.toString(),
        oraclePrice: UNDERLYING_PRICE,
        annualizedVolatility: ANNUALIZED_VOLATILITY,
        isPutOption: true,
      }))
    })

    it("Dynamic IV is calculated correctly for puts", async () => {
      // Enable dynamic IV
      await deployedAmm.setAmmConfig((0e18).toString(), true, 14400) // 0 vol bump, 4hr drift rate

      const startTime = expiration - ONE_WEEK_DURATION
      await mineBlock(startTime) // use the same time, no matter when this test gets called

      // Approve collateral
      await collateralToken.mint(ownerAccount, 1_000_000e6)
      await collateralToken.approve(deployedAmm.address, 1_000_000e6)

      // Provide capital
      let ret = await deployedAmm.provideCapital(1_000_000e6, 0)

      const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
      const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

      // Now let's do some trading from another account
      await collateralToken.mint(aliceAccount, 10000e6)
      await setNextBlockTimestamp(startTime + 10)
      await collateralToken.approve(deployedAmm.address, 10000e6, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "99820723135319286",
        "Price should be correct before trading",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1000000000000000000",
        "Volatility should be correct before trading",
      )

      await setNextBlockTimestamp(startTime + 20)

      // Buy bTokens
      ret = await deployedAmm.bTokenBuy(seriesId, 1e8, 3000e8, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "101068663367649286",
        "Price should be correct after trade1",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1024708406560868716",
        "Volatility should be correct after trade1",
      )

      // Approve bTokens to trade for collateral
      await deployedERC1155Controller.setApprovalForAll(
        deployedAmm.address,
        true,
        {
          from: aliceAccount,
        },
      )

      await setNextBlockTimestamp(startTime + 30)

      // Sell bTokens
      ret = await deployedAmm.bTokenSell(seriesId, 1e8, 0, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "99824626514898571",
        "Price should be correct after trade2",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1000093672028008723",
        "Volatility should be correct after trade2",
      )

      await setNextBlockTimestamp(startTime + 40)

      // Buy bTokens
      ret = await deployedAmm.bTokenBuy(seriesId, 1e8, 3000e8, {
        from: aliceAccount,
      })

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "101072514693392857",
        "Price should be correct after trade3",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1024802282210686479",
        "Volatility should be correct after trade3",
      )

      // Wait for 2 hours
      await mineBlock(startTime + 2 * 3600)

      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "100145202624350000",
        "Price should be correct after 2hr wait",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1012470036333706258",
        "Volatility should be correct after 2hr wait",
      )

      // Wait another 2 hours
      await mineBlock(startTime + 4 * 3600)
      assertBNEq(
        await deployedAmm.getPriceForSeries(seriesId),
        "99222087010467857",
        "Price should be correct after 4hr wait",
      )
      assertBNEq(
        await deployedAmm.getVolatility(seriesId),
        "1000068895228363018",
        "Volatility should be correct after 4hr wait",
      )
    })
  })
})
