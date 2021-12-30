import { time, expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract, ethers } from "hardhat"
import { deployAmm } from "../../scripts/lib/deploy_amm"
import {
  SimpleTokenContract,
  MockPriceOracleInstance,
  PriceOracleInstance,
  SimpleTokenInstance,
  MinterAmmInstance,
  SeriesControllerInstance,
  ERC1155ControllerInstance,
  AddressesProviderInstance,
  AmmDataProviderInstance,
  WTokenVaultInstance,
} from "../../typechain"

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

import {
  assertBNEq,
  assertBNEqWithTolerance,
  checkBalances,
  setupAllTestContracts,
  setupSeries,
  ONE_WEEK_DURATION,
  blackScholes,
  setNextBlockTimestamp,
  parseLogs,
  mineBlock,
} from "../util"

const WTokenVault = artifacts.require("WTokenVault")

let deployedSeriesController: SeriesControllerInstance
let deployedERC1155Controller: ERC1155ControllerInstance
let deployedAmm: MinterAmmInstance
let deployedMockPriceOracle: MockPriceOracleInstance
let deployedPriceOracle: PriceOracleInstance
let deployedAddressesProvider: AddressesProviderInstance
let deployedAmmDataProvider: AmmDataProviderInstance
let deployedWTokenVault: WTokenVaultInstance

let deployedMockVolatilityOracle

let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance
let collateralToken: SimpleTokenInstance
let lpToken: SimpleTokenInstance

let expiration: number
let seriesId: string
let expiration2: number
let seriesId2: string

const OTM_BTC_ORACLE_PRICE = 14_000 * 10 ** 8
const ITM_BTC_ORACLE_PRICE = 20_000 * 10 ** 8
const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const UNDERLYING_PRICE = OTM_BTC_ORACLE_PRICE
const ANNUALIZED_VOLATILITY = 1 * 1e8 // 100%
const VOLATILITY_BUMP = 0.2 * 1e8 // 20%
const PRICE_TOLERANCE = 1e13

const ERROR_MESSAGES = {
  INIT_ONCE: "Contract can only be initialized once.",
  NOT_SAME_TOKEN_CONTRACTS: "_underlyingToken cannot equal _priceToken",
  W_INVALID_REFUND: "wToken refund amount too high",
  B_INVALID_REFUND: "bToken refund amount too high",
  B_TOKEN_BUY_SLIPPAGE: "Slippage exceeded",
  B_TOKEN_SELL_SLIPPAGE: "Slippage exceeded",
  W_TOKEN_BUY_SLIPPAGE: "Slippage exceeded",
  W_TOKEN_SELL_SLIPPAGE: "Slippage exceeded",
  MIN_TRADE_SIZE: "Buy/Sell amount below min size",
  WITHDRAW_SLIPPAGE: "Slippage exceeded",
  WITHDRAW_COLLATERAL_MINIMUM: "E12",
  CAPITAL_DEPOSIT_REVERT: "Feature not supported",
  B_TOKEN_BUY_NOT_LARGE_ENOUGH: "Buy amount is too low",
}

contract("wToken Vault", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const lp2Account = accounts[3]
  const lp3Account = accounts[4]

  context("calls", () => {
    beforeEach(async () => {
      ;({
        underlyingToken,
        collateralToken,
        priceToken,
        lpToken,
        deployedAmm,
        lpToken,
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
      } = await setupAllTestContracts({
        strikePrice: STRIKE_PRICE.toString(),
        oraclePrice: UNDERLYING_PRICE,
        annualizedVolatility: ANNUALIZED_VOLATILITY,
      }))

      // Add second series
      expiration2 = expiration + ONE_WEEK_DURATION
      ;({ seriesId: seriesId2 } = await setupSeries({
        deployedSeriesController,
        underlyingToken,
        priceToken,
        collateralToken,
        expiration: expiration2,
        restrictedMinters: [deployedAmm.address],
        strikePrice: STRIKE_PRICE.toString(),
      }))
    })

    it("Last LP cannot sell wTokens to the pool", async () => {
      // Approve collateral
      await underlyingToken.mint(ownerAccount, 10e8)
      await underlyingToken.approve(deployedAmm.address, 10e8)

      // Provide capital
      await deployedAmm.provideCapital(10e8, 0)

      // Try to withdraw and sell
      await expectRevert(
        deployedAmm.withdrawCapital(10e8, true, 1),
        "Last LP can't sell wTokens to the pool",
      )
    })

    it("Single LP", async () => {
      const startTime = expiration - ONE_WEEK_DURATION
      await mineBlock(startTime) // use the same time, no matter when this test gets called

      // Approve collateral
      await underlyingToken.mint(ownerAccount, 10e8)
      await underlyingToken.approve(deployedAmm.address, 10e8)

      // Provide capital
      await deployedAmm.provideCapital(10e8, 0)

      // make trades
      // Approve collateral
      await underlyingToken.mint(aliceAccount, 1e8)
      await underlyingToken.approve(deployedAmm.address, 1e8, {
        from: aliceAccount,
      })

      await setNextBlockTimestamp(startTime + 10)

      // Buys series1
      await deployedAmm.bTokenBuy(seriesId, 1e8, 3.9e7, {
        from: aliceAccount,
      })

      await setNextBlockTimestamp(startTime + 20)

      // Buys series2
      await deployedAmm.bTokenBuy(seriesId2, 2e8, 3.9e7, {
        from: aliceAccount,
      })

      const wTokenIndex1 = await deployedSeriesController.wTokenIndex(seriesId)
      const wTokenIndex2 = await deployedSeriesController.wTokenIndex(seriesId2)
      const wTokenAmmBalance1 = await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex1,
      )
      const wTokenAmmBalance2 = await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex2,
      )
      assertBNEq(
        wTokenAmmBalance1,
        1e8,
        `AMM should have correct number of wTokens of series1`,
      )
      assertBNEq(
        wTokenAmmBalance2,
        2e8,
        `AMM should have correct number of wTokens of series2`,
      )

      // Compare pool value before and after withdrawal
      let poolValueBefore = await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      )

      await setNextBlockTimestamp(startTime + 25)

      // Withdraw 50% with locking
      let ret = await deployedAmm.withdrawCapital(5e8, false, 0)
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "LpTokensBurned", {
        redeemer: ownerAccount,
        collateralRemoved: "360188868", // 3.6e8 = (10e8 - 3e8 + premium) / 2
        lpTokensBurned: (5e8).toString(),
      })
      expectEvent(ret, "WTokensLocked", {
        ammAddress: deployedAmm.address,
        redeemer: ownerAccount,
        expirationId: "1",
        lpSharesMinted: "48066391", // 1e8 * 50% * (1 - 0.038) = 0.48
      })
      expectEvent(ret, "WTokensLocked", {
        ammAddress: deployedAmm.address,
        redeemer: ownerAccount,
        expirationId: "2",
        lpSharesMinted: "93472668", // 2e8 * 50% * (1 - 0.065) = 0.93
      })

      let poolValueAfter = await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      )

      assertBNEqWithTolerance(
        poolValueBefore,
        poolValueAfter.mul(new BN(2)),
        100,
        `Pool value should be reduced by half`,
      )

      // wToken balances shouldn't change
      const wTokenAmmBalanceNew1 = await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex1,
      )
      const wTokenAmmBalanceNew2 = await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex2,
      )
      assertBNEq(
        wTokenAmmBalanceNew1,
        1e8,
        `AMM should have correct number of wTokens of series1`,
      )
      assertBNEq(
        wTokenAmmBalanceNew2,
        2e8,
        `AMM should have correct number of wTokens of series2`,
      )

      // Check locked wTokens
      assertBNEq(
        await deployedWTokenVault.lockedWTokens(deployedAmm.address, seriesId),
        0.5e8,
        "WTokenVault should have correct number of tokens locked for series1",
      )
      assertBNEq(
        await deployedWTokenVault.lockedWTokens(deployedAmm.address, seriesId2),
        1.0e8,
        "WTokenVault should have correct number of tokens locked for series2",
      )

      await setNextBlockTimestamp(startTime + 40)

      // Sell bTokens to the pool

      // Sell all bTokens back to the AMM
      await deployedERC1155Controller.setApprovalForAll(
        deployedAmm.address,
        true,
        {
          from: aliceAccount,
        },
      )
      poolValueBefore = await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      )

      await setNextBlockTimestamp(startTime + 50)

      ret = await deployedAmm.bTokenSell(seriesId, 1e8, 0, {
        from: aliceAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events
      let lockedCollateral = Math.floor(
        (1e8 - ret.logs[0].args["collateralPaid"]) / 2,
      )
      assertBNEq(
        await deployedAmm.lockedCollateral(),
        lockedCollateral,
        "AMM lockedCollateral should be correct",
      )
      assertBNEq(
        (await collateralToken.balanceOf(deployedAmm.address)).sub(
          await deployedAmm.collateralBalance(),
        ),
        lockedCollateral,
        "Free and locked collateral should add up to total balance",
      )
      expectEvent(ret, "CollateralLocked", {
        ammAddress: deployedAmm.address,
        seriesId: seriesId,
        collateralAmount: "48463849",
        wTokenAmount: (0.5e8).toString(),
      })

      poolValueAfter = await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      )
      assertBNEq(
        poolValueAfter.sub(poolValueBefore),
        397460, // ~0.004e8 was added due to price impact
        `Pool value shouldn't change much because of the sale`,
      )

      // Withdraw collateral before expiration
      ret = await deployedAmm.withdrawLockedCollateral(1)
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events
      expectEvent(ret, "LpSharesRedeemed", {
        ammAddress: deployedAmm.address,
        redeemer: ownerAccount,
        expirationId: "1",
        numShares: "48066391",
        collateralAmount: "48463849",
      })

      // Trying to withdraw again should revert
      expectRevert(
        deployedAmm.withdrawLockedCollateral(1),
        "No collateral to redeem",
      )

      await mineBlock(expiration) // increase time past series1 expiration

      await setNextBlockTimestamp(expiration + 10)

      // Sell bToken from series2
      ret = await deployedAmm.bTokenSell(seriesId2, 2e8, 0, {
        from: aliceAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      lockedCollateral += Math.floor(
        (2e8 - ret.logs[0].args["collateralPaid"]) / 2 - 48463849,
      )
      assertBNEq(
        await deployedAmm.lockedCollateral(),
        lockedCollateral,
        "AMM lockedCollateral should be correct",
      )
      expectEvent(ret, "CollateralLocked", {
        ammAddress: deployedAmm.address,
        seriesId: seriesId2,
        collateralAmount: "97347556",
        wTokenAmount: (1e8).toString(),
      })

      await setNextBlockTimestamp(expiration2) // increase time past series2 expiration

      // Withdraw everything
      await deployedAmm.withdrawCapital(5e8, false, 0)
      await deployedAmm.withdrawLockedCollateral(2)

      // Check balances
      const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
      const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
      const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

      await checkBalances(
        deployedERC1155Controller,
        ownerAccount,
        "Owner",
        underlyingToken,
        bTokenIndex,
        wTokenIndex,
        lpToken,
        1012000548, // 10.12e8 LP made 0.12e8 profit
        0,
        0,
        0,
      )

      // Check AMM balances
      await checkBalances(
        deployedERC1155Controller,
        deployedAmm.address,
        "AMM",
        underlyingToken,
        bTokenIndex,
        wTokenIndex,
        lpToken,
        0,
        0,
        0,
        0,
      )

      assertBNEq(
        await deployedAmm.lockedCollateral(),
        0,
        "Locked collateral should be 0",
      )

      // Claiming again is not allowed
      await expectRevert(
        deployedAmm.withdrawLockedCollateral(1),
        "No collateral to redeem",
      )
    })

    it("Multiple LPs", async () => {
      const startTime = expiration - ONE_WEEK_DURATION
      await mineBlock(startTime) // use the same time, no matter when this test gets called

      // Approve collateral
      await underlyingToken.mint(ownerAccount, 10e8)
      await underlyingToken.approve(deployedAmm.address, 10e8)

      // LP1 provides capital
      await deployedAmm.provideCapital(10e8, 0)

      // make trades
      // Approve collateral
      await underlyingToken.mint(aliceAccount, 1e8)
      await underlyingToken.approve(deployedAmm.address, 1e8, {
        from: aliceAccount,
      })

      // Buys series1
      await setNextBlockTimestamp(startTime + 10)
      await deployedAmm.bTokenBuy(seriesId, 1e8, 3.9e7, {
        from: aliceAccount,
      })

      // Buys series2
      await setNextBlockTimestamp(startTime + 20)
      await deployedAmm.bTokenBuy(seriesId2, 2e8, 3.9e7, {
        from: aliceAccount,
      })

      const wTokenIndex1 = await deployedSeriesController.wTokenIndex(seriesId)
      const wTokenIndex2 = await deployedSeriesController.wTokenIndex(seriesId2)

      // LP2 provides capital
      await underlyingToken.mint(lp2Account, 5e8)
      await underlyingToken.approve(deployedAmm.address, 5e8, {
        from: lp2Account,
      })
      await setNextBlockTimestamp(startTime + 30)
      let ret = await deployedAmm.provideCapital(5e8, 0, { from: lp2Account })

      expectEvent(ret, "LpTokensMinted", {
        minter: lp2Account,
        collateralAdded: (5e8).toString(),
        lpTokensMinted: "498277979", // 1.003 per LP token
      })

      // Oracle price changes
      await deployedMockPriceOracle.setLatestAnswer(13_000e8)

      await deployedERC1155Controller.setApprovalForAll(
        deployedAmm.address,
        true,
        {
          from: aliceAccount,
        },
      )

      // LP1 withdraws 2e8 / 14.98e8 = 13% of pool
      // let lpTokenSupply = await lpToken.totalSupply() // 1498277979
      await setNextBlockTimestamp(startTime + 40)
      ret = await deployedAmm.withdrawCapital(2e8, false, 0, {
        from: ownerAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      // console.log("series1 price", (await deployedAmm.getPriceForSeries(seriesId)).toString()) // 0.019
      // console.log("series2 price", (await deployedAmm.getPriceForSeries(seriesId2)).toString()) // 0.042

      expectEvent(ret, "LpTokensBurned", {
        redeemer: ownerAccount,
        collateralRemoved: "162904047", // 0.81 collateral per LP token
        lpTokensBurned: (2e8).toString(),
      })
      expectEvent(ret, "WTokensLocked", {
        ammAddress: deployedAmm.address,
        redeemer: ownerAccount,
        expirationId: "1",
        lpSharesMinted: "13092381", // 1e8 * 13% * (1 - 0.019) = 0.13
      })
      expectEvent(ret, "WTokensLocked", {
        ammAddress: deployedAmm.address,
        redeemer: ownerAccount,
        expirationId: "2",
        lpSharesMinted: "25581259", // 2e8 * 13% * (1 - 0.042)= 0.25
      })

      // console.log('series1 locked', (await deployedWTokenVault.getWTokenBalance(deployedAmm.address, seriesId)).toString()) // 13348657
      // console.log('series2 locked', (await deployedWTokenVault.getWTokenBalance(deployedAmm.address, seriesId2)).toString()) // 26697315

      // bTokens sold to the pool (1 & 2)
      await setNextBlockTimestamp(startTime + 50)
      ret = await deployedAmm.bTokenSell(seriesId, 0.2e8, 0.01e7, {
        from: aliceAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "BTokensSold", {
        seller: aliceAccount,
        bTokensSold: (0.2e8).toString(),
        collateralPaid: "377100", // 0.019
      })
      expectEvent(ret, "CollateralLocked", {
        ammAddress: deployedAmm.address,
        seriesId: seriesId,
        collateralAmount: "13096968",
        wTokenAmount: "13348657", // matches the total locked amount for series1
      })

      await setNextBlockTimestamp(startTime + 60)
      ret = await deployedAmm.bTokenSell(seriesId2, 1.0e8, 0.1e7, {
        from: aliceAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "BTokensSold", {
        seller: aliceAccount,
        bTokensSold: (1.0e8).toString(),
        collateralPaid: "3847190", // 0.038
      })
      expectEvent(ret, "CollateralLocked", {
        ammAddress: deployedAmm.address,
        seriesId: seriesId2,
        collateralAmount: "25670218",
        wTokenAmount: "26697315", // matches the total locked amount for series2
      })

      // LP3 provides capital
      await underlyingToken.mint(lp3Account, 3e8)
      await underlyingToken.approve(deployedAmm.address, 3e8, {
        from: lp3Account,
      })
      await setNextBlockTimestamp(startTime + 70)
      ret = await deployedAmm.provideCapital(3e8, 0, { from: lp3Account })

      expectEvent(ret, "LpTokensMinted", {
        minter: lp3Account,
        collateralAdded: (3e8).toString(),
        lpTokensMinted: "297595869", // 1.008 per LP token
      })

      // LP2 withdraws all capital
      ret = await deployedAmm.withdrawCapital(498277979, false, 0, {
        from: lp2Account,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "LpTokensBurned", {
        redeemer: lp2Account,
        collateralRemoved: "447886841", // 0.90 collateral per LP token
        lpTokensBurned: "498277979",
      })
      expectEvent(ret, "WTokensLocked", {
        ammAddress: deployedAmm.address,
        redeemer: lp2Account,
        expirationId: "1",
        lpSharesMinted: "24490217", //
      })
      expectEvent(ret, "WTokensLocked", {
        ammAddress: deployedAmm.address,
        redeemer: lp2Account,
        expirationId: "2",
        lpSharesMinted: "29814008", //
      })

      // LP1 withdraws locked collateral early
      ret = await deployedAmm.withdrawLockedCollateral(1, {
        from: ownerAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "LpSharesRedeemed", {
        ammAddress: deployedAmm.address,
        redeemer: ownerAccount,
        expirationId: "1",
        numShares: "13092381",
        collateralAmount: "4562497",
      })

      // Expiration 1
      await mineBlock(expiration)

      // LP1 withdraws locked collateral
      ret = await deployedAmm.withdrawLockedCollateral(1, {
        from: ownerAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "LpSharesRedeemed", {
        ammAddress: deployedAmm.address,
        redeemer: ownerAccount,
        expirationId: "1",
        numShares: "13092381",
        collateralAmount: "8701516", // 4562497 + 8701516 = 13264013 (1.013 per share)
      })

      // LP2 withdraws locked collateral
      ret = await deployedAmm.withdrawLockedCollateral(1, { from: lp2Account })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "LpSharesRedeemed", {
        ammAddress: deployedAmm.address,
        redeemer: lp2Account,
        expirationId: "1",
        numShares: "24490217",
        collateralAmount: "24811268", // 1.013 per share
      })

      // Oracle price changes
      await deployedMockPriceOracle.setLatestAnswer(16_000e8)

      // bTokens sold to the pool (3)
      await setNextBlockTimestamp(expiration + 10)
      ret = await deployedAmm.bTokenSell(seriesId2, 0.3e8, 0.1e7, {
        from: aliceAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "BTokensSold", {
        seller: aliceAccount,
        bTokensSold: (0.3e8).toString(),
        collateralPaid: "2936045", // 0.098
      })
      expectEvent(ret, "CollateralLocked", {
        ammAddress: deployedAmm.address,
        seriesId: seriesId2,
        collateralAmount: "27063955",
        wTokenAmount: "30000000", //
      })

      // LP3 withdraws capital
      await setNextBlockTimestamp(expiration + 20)
      ret = await deployedAmm.withdrawCapital(2e8, false, 0, {
        from: lp3Account,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "LpTokensBurned", {
        redeemer: lp3Account,
        collateralRemoved: "189799740", // 0.95 collateral per LP token
        lpTokensBurned: (2e8).toString(),
      })
      expectEvent(ret, "WTokensLocked", {
        ammAddress: deployedAmm.address,
        redeemer: lp3Account,
        expirationId: "2",
        lpSharesMinted: "11810386", //
      })

      // bTokens sold to the pool (4)
      await setNextBlockTimestamp(expiration + 30)
      ret = await deployedAmm.bTokenSell(seriesId2, 0.2e8, 0.1e7, {
        from: aliceAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "BTokensSold", {
        seller: aliceAccount,
        bTokensSold: (0.2e8).toString(),
        collateralPaid: "1965660", // 0.098
      })
      expectEvent(ret, "CollateralLocked", {
        ammAddress: deployedAmm.address,
        seriesId: seriesId2,
        collateralAmount: "12604238",
        wTokenAmount: "13978042", //
      })

      // Expiration 1
      await mineBlock(expiration2)

      // LP1 withdraws all capital
      await setNextBlockTimestamp(expiration2 + 10)
      ret = await deployedAmm.withdrawCapital(8e8, false, 0, {
        from: ownerAccount,
      })

      expectEvent(ret, "LpTokensBurned", {
        redeemer: ownerAccount,
        collateralRemoved: "805816917", // 1.007 collateral per LP token
        lpTokensBurned: (8e8).toString(),
      })

      // LP3 withdraws all capital
      await setNextBlockTimestamp(expiration2 + 20)
      ret = await deployedAmm.withdrawCapital(97595869, false, 0, {
        from: lp3Account,
      })

      expectEvent(ret, "LpTokensBurned", {
        redeemer: lp3Account,
        collateralRemoved: "98305503", // 1.007 collateral per LP token
        lpTokensBurned: "97595869",
      })

      // LP1 claims from expired pool
      ret = await deployedAmm.withdrawLockedCollateral(2, {
        from: ownerAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "LpSharesRedeemed", {
        ammAddress: deployedAmm.address,
        redeemer: ownerAccount,
        expirationId: "2",
        numShares: "25581259",
        collateralAmount: "24870509", // 0.97 per share
      })

      // LP2 claims from expired pool
      ret = await deployedAmm.withdrawLockedCollateral(2, { from: lp2Account })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "LpSharesRedeemed", {
        ammAddress: deployedAmm.address,
        redeemer: lp2Account,
        expirationId: "2",
        numShares: "29814008",
        collateralAmount: "28985655", // 0.97 per share
      })

      // LP3 claims from expired pool
      ret = await deployedAmm.withdrawLockedCollateral(2, { from: lp3Account })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "LpSharesRedeemed", {
        ammAddress: deployedAmm.address,
        redeemer: lp3Account,
        expirationId: "2",
        numShares: "11810386",
        collateralAmount: "11482246", // 0.97 per share
      })

      // Check balances
      const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
      const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

      await checkBalances(
        deployedERC1155Controller,
        ownerAccount,
        "LP1",
        underlyingToken,
        bTokenIndex,
        wTokenIndex,
        lpToken,
        1006855486, // 10.07e8
        0,
        0,
        0,
      )

      await checkBalances(
        deployedERC1155Controller,
        lp2Account,
        "LP2",
        underlyingToken,
        bTokenIndex,
        wTokenIndex,
        lpToken,
        501683764, // 5.01e8
        0,
        0,
        0,
      )

      await checkBalances(
        deployedERC1155Controller,
        lp3Account,
        "LP3",
        underlyingToken,
        bTokenIndex,
        wTokenIndex,
        lpToken,
        299587489, // 2.99e8
        0,
        0,
        0,
      )

      await checkBalances(
        deployedERC1155Controller,
        deployedAmm.address,
        "AMM",
        underlyingToken,
        bTokenIndex,
        wTokenIndex,
        lpToken,
        2, // some dust left due to rounding
        0,
        0,
        0,
      )
      assertBNEq(
        await deployedAmm.lockedCollateral(),
        2,
        `AMM locked collateral should be 2`,
      )

      // Check WTokenVault state
      assertBNEq(
        await deployedWTokenVault.getWTokenBalance(
          deployedAmm.address,
          seriesId,
        ),
        0,
        `0 wTokens should be locked`,
      )
      assertBNEq(
        await deployedWTokenVault.getWTokenBalance(
          deployedAmm.address,
          seriesId2,
        ),
        0,
        `0 wTokens should be locked`,
      )
    })
  })

  context("puts", () => {
    beforeEach(async () => {
      ;({
        underlyingToken,
        collateralToken,
        priceToken,
        lpToken,
        deployedAmm,
        lpToken,
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
      } = await setupAllTestContracts({
        strikePrice: STRIKE_PRICE.toString(),
        oraclePrice: UNDERLYING_PRICE,
        annualizedVolatility: ANNUALIZED_VOLATILITY,
        isPutOption: true,
      }))

      // Add second series
      expiration2 = expiration + ONE_WEEK_DURATION
      ;({ seriesId: seriesId2 } = await setupSeries({
        deployedSeriesController,
        underlyingToken,
        priceToken,
        collateralToken,
        expiration: expiration2,
        restrictedMinters: [deployedAmm.address],
        strikePrice: STRIKE_PRICE.toString(),
        isPutOption: true,
      }))
    })

    it("Single LP", async () => {
      const startTime = expiration - ONE_WEEK_DURATION
      await mineBlock(startTime) // use the same time, no matter when this test gets called

      // Approve collateral
      await collateralToken.mint(ownerAccount, 1_000_000e6)
      await collateralToken.approve(deployedAmm.address, 1_000_000e6)

      // Provide capital
      await deployedAmm.provideCapital(1_000_000e6, 0)

      // make trades
      // Approve collateral
      await collateralToken.mint(aliceAccount, 10000e6)
      await collateralToken.approve(deployedAmm.address, 10000e6, {
        from: aliceAccount,
      })

      await setNextBlockTimestamp(startTime + 10)

      // price1 110101729425714285
      // price2 136702494769285714

      // Buys series1
      let ret = await deployedAmm.bTokenBuy(seriesId, 1e8, "1560234275", {
        from: aliceAccount,
      })

      await setNextBlockTimestamp(startTime + 20)

      // Buys series2
      ret = await deployedAmm.bTokenBuy(seriesId2, 2e8, "3918022406", {
        from: aliceAccount,
      })

      const wTokenIndex1 = await deployedSeriesController.wTokenIndex(seriesId)
      const wTokenIndex2 = await deployedSeriesController.wTokenIndex(seriesId2)
      const wTokenAmmBalance1 = await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex1,
      )
      const wTokenAmmBalance2 = await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex2,
      )
      assertBNEq(
        wTokenAmmBalance1,
        1e8,
        `AMM should have correct number of wTokens of series1`,
      )
      assertBNEq(
        wTokenAmmBalance2,
        2e8,
        `AMM should have correct number of wTokens of series2`,
      )

      // Compare pool value before and after withdrawal
      let poolValueBefore = await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      )

      await setNextBlockTimestamp(startTime + 25)

      // Withdraw 50% with locking
      ret = await deployedAmm.withdrawCapital(500_000e6, false, 0)
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      expectEvent(ret, "LpTokensBurned", {
        redeemer: ownerAccount,
        collateralRemoved: "480239128340",
        lpTokensBurned: (500_000e6).toString(),
      })
      expectEvent(ret, "WTokensLocked", {
        ammAddress: deployedAmm.address,
        redeemer: ownerAccount,
        expirationId: "1",
        lpSharesMinted: "6729294826", // 1 * 50% * (15_000 - 0.11 * 14_000) = 6730
      })
      expectEvent(ret, "WTokensLocked", {
        ammAddress: deployedAmm.address,
        redeemer: ownerAccount,
        expirationId: "2",
        lpSharesMinted: "13086173636", // 2 * 50% * (15_000 - 0.14 * 14_000) = 13086
      })

      let poolValueAfter = await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      )

      assertBNEqWithTolerance(
        poolValueBefore,
        poolValueAfter.mul(new BN(2)),
        10000,
        `Pool value should be reduced by half`,
      )

      // wToken balances shouldn't change
      const wTokenAmmBalanceNew1 = await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex1,
      )
      const wTokenAmmBalanceNew2 = await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex2,
      )
      assertBNEq(
        wTokenAmmBalanceNew1,
        1e8,
        `AMM should have correct number of wTokens of series1`,
      )
      assertBNEq(
        wTokenAmmBalanceNew2,
        2e8,
        `AMM should have correct number of wTokens of series2`,
      )

      // Check locked wTokens
      assertBNEq(
        await deployedWTokenVault.lockedWTokens(deployedAmm.address, seriesId),
        0.5e8,
        "WTokenVault should have correct number of tokens locked for series1",
      )
      assertBNEq(
        await deployedWTokenVault.lockedWTokens(deployedAmm.address, seriesId2),
        1.0e8,
        "WTokenVault should have correct number of tokens locked for series2",
      )

      await setNextBlockTimestamp(startTime + 40)

      // Sell bTokens to the pool

      // Sell all bTokens back to the AMM
      await deployedERC1155Controller.setApprovalForAll(
        deployedAmm.address,
        true,
        {
          from: aliceAccount,
        },
      )
      poolValueBefore = await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      )

      await setNextBlockTimestamp(startTime + 50)

      ret = await deployedAmm.bTokenSell(seriesId, 1e8, 0, {
        from: aliceAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      let lockedCollateral = Math.floor(
        (15_000e6 - ret.logs[0].args["collateralPaid"]) / 2,
      )
      assertBNEq(
        await deployedAmm.lockedCollateral(),
        lockedCollateral,
        "AMM lockedCollateral should be correct",
      )
      expectEvent(ret, "CollateralLocked", {
        ammAddress: deployedAmm.address,
        seriesId: seriesId,
        collateralAmount: "6748259280", // (15_000 - 1503481439 / 1e6) / 2
        wTokenAmount: (0.5e8).toString(),
      })

      poolValueAfter = await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      )
      assertBNEq(
        poolValueAfter.sub(poolValueBefore),
        18964618, // ~18e6 was added due to price impact
        `Pool value shouldn't change much because of the sale`,
      )

      await mineBlock(expiration) // increase time past series1 expiration

      await setNextBlockTimestamp(expiration + 10)

      // Sell bToken from series2
      ret = await deployedAmm.bTokenSell(seriesId2, 2e8, 0, {
        from: aliceAccount,
      })
      parseLogs(ret, deployedWTokenVault.contract) // parse WTokenVault events

      lockedCollateral += Math.floor(
        (15_000e6 * 2 - ret.logs[0].args["collateralPaid"]) / 2,
      )
      assertBNEq(
        await deployedAmm.lockedCollateral(),
        lockedCollateral,
        "AMM lockedCollateral should be correct",
      )
      assertBNEq(
        (await collateralToken.balanceOf(deployedAmm.address)).sub(
          await deployedAmm.collateralBalance(),
        ),
        lockedCollateral,
        "Free and locked collateral should add up to total balance",
      )
      expectEvent(ret, "CollateralLocked", {
        ammAddress: deployedAmm.address,
        seriesId: seriesId2,
        collateralAmount: "13531788999", // ~(15_000  - 0.13 * 14_000)
        wTokenAmount: (1e8).toString(),
      })

      await setNextBlockTimestamp(expiration2) // increase time past series2 expiration

      // Withdraw everything
      await deployedAmm.withdrawCapital(500_000e6, false, 0)

      await deployedAmm.withdrawLockedCollateral(1)
      await deployedAmm.withdrawLockedCollateral(2)

      // Check balances
      const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
      const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
      const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

      await checkBalances(
        deployedERC1155Controller,
        ownerAccount,
        "Owner",
        collateralToken,
        bTokenIndex,
        wTokenIndex,
        lpToken,
        1001038353240, // 1_001_038e6 LP made 1_038e6 profit
        0,
        0,
        0,
      )

      // Check AMM balances
      await checkBalances(
        deployedERC1155Controller,
        deployedAmm.address,
        "AMM",
        underlyingToken,
        bTokenIndex,
        wTokenIndex,
        lpToken,
        0,
        0,
        0,
        0,
      )

      assertBNEq(
        await deployedAmm.lockedCollateral(),
        0,
        "Locked collateral should be 0",
      )

      // Claiming again is not allowed
      await expectRevert(
        deployedAmm.withdrawLockedCollateral(1),
        "No collateral to redeem",
      )
    })
  })
})
