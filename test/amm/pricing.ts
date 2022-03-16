import { expectEvent, time, expectRevert } from "@openzeppelin/test-helpers"
import { contract } from "hardhat"
import {
  SimpleTokenInstance,
  MinterAmmInstance,
  AmmDataProviderInstance,
  ERC1155ControllerInstance,
  SeriesControllerInstance,
} from "../../typechain"

let deployedAmm: MinterAmmInstance
let deployedAmmDataProvider: AmmDataProviderInstance
let deployedERC1155Controller: ERC1155ControllerInstance
let collateralToken: SimpleTokenInstance
let deployedSeriesController: SeriesControllerInstance

let seriesId: string
let expiration: number

import {
  assertBNEq,
  ONE_WEEK_DURATION,
  setupAllTestContracts,
  setNextBlockTimestamp,
  setupSingletonTestContracts,
  setupAmm,
  setupSeries,
  getNextFriday8amUTCTimestamp,
  now,
} from "../util"

const BTC_ORACLE_PRICE = 14_000 * 1e8 // BTC oracle answer has 8 decimals places, same as BTC
const STRIKE_PRICE = 15_000 * 1e8

contract("AMM Pricing", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]

  it("should calculate correctly when USDC is the collateral token", async () => {
    ;({
      collateralToken,
      deployedAmm,
      deployedAmmDataProvider,
      seriesId,
      deployedERC1155Controller,
      deployedSeriesController,
      expiration,
    } = await setupAllTestContracts({
      oraclePrice: BTC_ORACLE_PRICE,
      strikePrice: STRIKE_PRICE.toString(),
      isPutOption: true,
    }))

    // Approve collateral
    await collateralToken.mint(ownerAccount, 1000e6)
    await collateralToken.approve(deployedAmm.address, 1000e6)

    // Provide capital
    let ret = await deployedAmm.provideCapital(1000e6, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: (1000e6).toString(),
      lpTokensMinted: (1000e6).toString(),
    })

    // Collateral should be moved away from Owner
    assertBNEq(
      await collateralToken.balanceOf(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 1000e6 collateral should be in the AMM.
    assertBNEq(
      await collateralToken.balanceOf(deployedAmm.address),
      1000e6,
      "Collateral should have been used to mint",
    )

    const startTime = expiration - ONE_WEEK_DURATION
    await time.increaseTo(startTime) // use the same time, no matter when this test gets called

    assertBNEq(
      (await deployedAmm.getPriceForSeries(seriesId)).toString(),
      "110102040416428571", // 0.1101 WBTC
      "AMM should have correct price for series",
    )

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      1000e6,
      "Total assets value in the AMM should be 10k",
    )

    // Now let's do some trading and see how price behaves
    await collateralToken.mint(aliceAccount, 1e6)
    await collateralToken.approve(deployedAmm.address, 1e6, {
      from: aliceAccount,
    })

    await setNextBlockTimestamp(startTime + 10)

    // Buy bTokens
    const maximumCollateral =
      await deployedAmmDataProvider.bTokenGetCollateralInView(
        deployedAmm.address,
        seriesId,
        10000,
      )

    assertBNEq(
      maximumCollateral,
      154329,
      "Incorent maximumCollateral value for bToken",
    )

    const series = await deployedSeriesController.series(seriesId)
    const maximumCollateralForNewSeries =
      await deployedAmmDataProvider.bTokenGetCollateralInForNewSeries(
        series,
        deployedAmm.address,
        10000,
      )
    assertBNEq(
      maximumCollateralForNewSeries,
      maximumCollateral,
      "MaximumCollateral should be equal for existent series and non existent series",
    )

    ret = await deployedAmm.bTokenBuy(seriesId, 10000, maximumCollateral, {
      from: aliceAccount,
    })
    assertBNEq(
      (await collateralToken.balanceOf(aliceAccount)).toString(),
      845672, // paid 154,329 for 10000 tokens at ~0.1101 WBTC per 1e8 bToken + price impact
      "Trader should pay correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      (
        await deployedAmmDataProvider.getTotalPoolValueView(
          deployedAmm.address,
          true,
        )
      ).toString(),
      1000000186, // 1000e6 - 10000 * 15000 / 100 + 154329 + 10000 * (15000 / 14000 - 0.1101) * 14000 / 100
      "Total assets value in the AMM should be above 1000e6",
    )

    // Sell bTokens
    await deployedERC1155Controller.setApprovalForAll(
      deployedAmm.address,
      true,
      { from: aliceAccount },
    )

    await setNextBlockTimestamp(startTime + 20)

    ret = await deployedAmm.bTokenSell(seriesId, 10000, 153955, {
      from: aliceAccount,
    })
    assertBNEq(
      (await collateralToken.balanceOf(aliceAccount)).toString(),
      999627, // received 153,956 for 10000 tokens at ~0.1101
      "Trader should receive correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      (
        await deployedAmmDataProvider.getTotalPoolValueView(
          deployedAmm.address,
          true,
        )
      ).toString(),
      1000000373,
      "Total assets value in the AMM should be above 1000e6",
    )
  })

  it("should calculate correctly when WBTC is the collateral token", async () => {
    ;({
      collateralToken,
      deployedAmm,
      seriesId,
      deployedERC1155Controller,
      deployedAmmDataProvider,
      deployedSeriesController,
      expiration,
    } = await setupAllTestContracts({
      oraclePrice: BTC_ORACLE_PRICE,
      strikePrice: STRIKE_PRICE.toString(),
    }))

    // Approve collateral
    await collateralToken.mint(ownerAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "10000",
      lpTokensMinted: "10000",
    })

    // Collateral should be moved away from Owner
    assertBNEq(
      await collateralToken.balanceOf(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 10k collateral should be in the AMM.
    assertBNEq(
      await collateralToken.balanceOf(deployedAmm.address),
      10000,
      "Collateral should have been used to mint",
    )

    // Buy bTokens
    const maximumCollateral =
      await deployedAmmDataProvider.bTokenGetCollateralInView(
        deployedAmm.address,
        seriesId,
        10000,
      )

    assertBNEq(
      maximumCollateral,
      2315,
      "Incorent maximumCollateral value for bToken",
    )

    const series = await deployedSeriesController.series(seriesId)
    const maximumCollateralForNewSeries =
      await deployedAmmDataProvider.bTokenGetCollateralInForNewSeries(
        series,
        deployedAmm.address,
        10000,
      )
    assertBNEq(
      maximumCollateralForNewSeries,
      maximumCollateral,
      "MaximumCollateral should be equal for existent series and non existent series",
    )

    //bTokenGetCollateralInForNewSeries revert testing
    let tokens = {
      ...series.tokens,
    }
    let seriesRevert

    seriesRevert = {
      expirationDate: "1648800000",
      isPutOption: false,
      strikePrice: "1500000000000",
      tokens: { ...tokens },
    }
    // 0x29D7d1dd5B6f9C864d9db560D72a247c178aE86B is some random address from internet
    // Check revert for priceToken
    seriesRevert.tokens.priceToken =
      "0x29D7d1dd5B6f9C864d9db560D72a247c178aE86B"
    await expectRevert(
      deployedAmmDataProvider.bTokenGetCollateralInForNewSeries(
        seriesRevert,
        deployedAmm.address,
        10000,
      ),
      "!priceToken",
    )

    // Check revert for collateralToken
    seriesRevert = {
      expirationDate: "1648800000",
      isPutOption: false,
      strikePrice: "1500000000000",
      tokens: { ...tokens },
    }
    seriesRevert.tokens.collateralToken =
      "0x29D7d1dd5B6f9C864d9db560D72a247c178aE86B"
    await expectRevert(
      deployedAmmDataProvider.bTokenGetCollateralInForNewSeries(
        seriesRevert,
        deployedAmm.address,
        10000,
      ),
      "!collateralToken",
    )

    // Check revert for underlyingToken
    seriesRevert = {
      expirationDate: "1648800000",
      isPutOption: false,
      strikePrice: "1500000000000",
      tokens: { ...tokens },
    }
    seriesRevert.tokens.underlyingToken =
      "0x29D7d1dd5B6f9C864d9db560D72a247c178aE86B"
    await expectRevert(
      deployedAmmDataProvider.bTokenGetCollateralInForNewSeries(
        seriesRevert,
        deployedAmm.address,
        10000,
      ),
      "!underlyingToken",
    )

    const startTime = expiration - ONE_WEEK_DURATION
    await time.increaseTo(startTime) // use the same time, no matter when this test gets called

    assertBNEq(
      (await deployedAmm.getPriceForSeries(seriesId)).toString(),
      "38673468987857142", // 0.039 BTC / contract
      "AMM should have correct price for series",
    )

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    // Now let's do some trading and see how price behaves
    await collateralToken.mint(aliceAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    await setNextBlockTimestamp(startTime + 10)

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(seriesId, 3000, 3000, {
      from: aliceAccount,
    })
    assertBNEq(
      await collateralToken.balanceOf(aliceAccount),
      841, // paid 159 for 3000 tokens at ~0.039 + slippage
      "Trader should pay correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      10042, // 10000 - 3000 + 159 + 3000 * (1 - 0.039)
      "Total assets value in the AMM should be above 10k",
    )

    // Sell bTokens
    await deployedERC1155Controller.setApprovalForAll(
      deployedAmm.address,
      true,
      { from: aliceAccount },
    )

    await setNextBlockTimestamp(startTime + 20)

    ret = await deployedAmm.bTokenSell(seriesId, 3000, 0, {
      from: aliceAccount,
    })
    assertBNEq(
      await collateralToken.balanceOf(aliceAccount),
      924, // received 83 for 3000 tokens at ~0.039 - price impact
      "Trader should receive correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      10076,
      "Total assets value in the AMM should be above 10k",
    )
  })

  it("bToken...View should return the same as bToken...NewSeries", async () => {
    // This test tests the call series only
    expiration = getNextFriday8amUTCTimestamp((await now()) + ONE_WEEK_DURATION)

    let priceToken: SimpleTokenInstance
    let underlyingToken: SimpleTokenInstance
    let deployedAmmFactory
    let deployedPriceOracle
    let deployedBlackScholes
    let deployedAddressesProvider
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedAmmFactory,
      deployedAmmDataProvider,
      deployedSeriesController,
      deployedPriceOracle,
      deployedAmmDataProvider,
      deployedBlackScholes,
      deployedAddressesProvider,
    } = await setupSingletonTestContracts({
      oraclePrice: BTC_ORACLE_PRICE,
    }))

    const { deployedAmm } = await setupAmm({
      deployedAmmFactory,
      deployedPriceOracle,
      deployedAmmDataProvider,
      deployedBlackScholes,
      deployedAddressesProvider,
      underlyingToken,
      priceToken,
      collateralToken,
      tradeFeeBasisPoints: 0,
    })

    // Approve collateral
    await collateralToken.mint(ownerAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "10000",
      lpTokensMinted: "10000",
    })

    const startTime = expiration - ONE_WEEK_DURATION
    await time.increaseTo(startTime) // use the same time, no matter when this test gets called

    const tokens = {
      underlyingToken: underlyingToken.address,
      collateralToken: collateralToken.address,
      priceToken: priceToken.address,
    }

    const series = {
      tokens,
      expirationDate: expiration,
      isPutOption: false,
      strikePrice: STRIKE_PRICE.toString(),
    }
    const maximumCollateralForNewSeries =
      await deployedAmmDataProvider.bTokenGetCollateralInForNewSeries(
        series,
        deployedAmm.address,
        10000,
      )

    ;({ seriesId } = await setupSeries({
      deployedSeriesController,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration,
      restrictedMinters: [deployedAmm.address],
      strikePrice: STRIKE_PRICE.toString(),
      isPutOption: false,
    }))

    const maximumCollateral =
      await deployedAmmDataProvider.bTokenGetCollateralInView(
        deployedAmm.address,
        seriesId,
        10000,
      )

    assertBNEq(
      maximumCollateral,
      maximumCollateralForNewSeries,
      "bTokens...ForNewSeries and bTokens...InView should be the same",
    )
  })
})
