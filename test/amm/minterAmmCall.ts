/* global artifacts contract it assert */
import { time, expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract } from "hardhat"
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
} from "../util"

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

let expiration: number
let seriesId: string

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
  B_TOKEN_BUY_SLIPPAGE: "E20",
  B_TOKEN_SELL_SLIPPAGE: "E20",
  W_TOKEN_BUY_SLIPPAGE: "E20",
  W_TOKEN_SELL_SLIPPAGE: "E20",
  MIN_TRADE_SIZE: "Buy/Sell amount below min size",
  WITHDRAW_SLIPPAGE: "E20",
  WITHDRAW_COLLATERAL_MINIMUM: "E12",
  CAPITAL_DEPOSIT_REVERT: "Feature not supported",
  B_TOKEN_BUY_NOT_LARGE_ENOUGH: "E23",
}

contract("AMM Call Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

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
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: UNDERLYING_PRICE,
      annualizedVolatility: ANNUALIZED_VOLATILITY,
    }))
  })

  it("Provides capital without trading", async () => {
    // Providing capital before approving should fail
    await expectRevert.unspecified(deployedAmm.provideCapital(10000, 0))

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000)
    await underlyingToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "10000",
      lpTokensMinted: "10000",
    })

    // Collateral should be moved away from Owner
    assertBNEq(
      await underlyingToken.balanceOf(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 10k collateral should be in the AMM.
    assertBNEq(
      await underlyingToken.balanceOf(deployedAmm.address),
      10000,
      "Collateral should have been used to mint",
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

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    // 0 bTokens should be in the AMM
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      0,
      "No bTokens should be in the AMM yet",
    )

    // 0 of wTokens should be in the AMM
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      0,
      "No wTokens should be in the AMM yet",
    )

    // LP tokens should have been given out
    assertBNEq(
      await lpToken.balanceOf(ownerAccount),
      10000,
      "lp tokens should have been minted",
    )

    // Now there are 10k lpTokens in the AMM...
    // If another user deposits another 1k collateral, it should increase
    // the number of lpTokens by 1000
    await underlyingToken.mint(aliceAccount, 1000)
    await underlyingToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Provide capital
    ret = await deployedAmm.provideCapital(1000, 0, { from: aliceAccount })

    expectEvent(ret, "LpTokensMinted", {
      minter: aliceAccount,
      collateralAdded: "1000",
      lpTokensMinted: "1000",
    })

    assertBNEq(
      await lpToken.balanceOf(aliceAccount),
      1000,
      "lp tokens should have been minted",
    )

    // Now let's withdraw half of alice's lp tokens (she has 1000 lp tokens)
    ret = await deployedAmm.withdrawCapital(500, true, 500, {
      from: aliceAccount,
    })

    // Check the math
    expectEvent(ret, "LpTokensBurned", {
      redeemer: aliceAccount,
      collateralRemoved: "500",
      lpTokensBurned: "500",
    })
  })

  it("Provides and immediately withdraws capital without trading", async () => {
    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000)
    await underlyingToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "10000",
      lpTokensMinted: "10000",
    })

    // Collateral should be moved away from Owner
    assertBNEq(
      await underlyingToken.balanceOf(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 10k collateral should be in the AMM.
    assertBNEq(
      await underlyingToken.balanceOf(deployedAmm.address),
      10000,
      "Collateral should have been used to mint",
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

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    // 0 bTokens should be in the AMM
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      0,
      "No bTokens should be in the AMM yet",
    )

    // 0 of wTokens should be in the AMM
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      0,
      "No wTokens should be in the AMM yet",
    )

    // LP tokens should have been given out
    assertBNEq(
      await lpToken.balanceOf(ownerAccount),
      10000,
      "lp tokens should have been minted",
    )

    // Now let's withdraw all of the owner's lpTokens (owner should have 10000 lp tokens)
    ret = await deployedAmm.withdrawCapital(10000, false, 0)

    // Check the math
    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "10000",
      lpTokensBurned: "10000",
    })

    // LP tokens should have been given out
    assertBNEq(
      await lpToken.balanceOf(ownerAccount),
      0,
      "all lp tokens should have been withdraw",
    )

    // Collateral should be moved away from AMM
    assertBNEq(
      await underlyingToken.balanceOf(deployedAmm.address),
      0,
      "AMM should have no collateral",
    )

    // Collateral should be moved to Owner
    assertBNEq(
      await underlyingToken.balanceOf(ownerAccount),
      10000,
      "Owner should have the same amount of collateral they had prior to providing capital",
    )
  })

  it("Provides capital with trading", async () => {
    const startTime = expiration - ONE_WEEK_DURATION
    await time.increaseTo(startTime) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10e8)
    await underlyingToken.approve(deployedAmm.address, 10e8)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10e8, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "1000000000",
      lpTokensMinted: "1000000000",
    })

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      10e8,
      "Total assets value in the AMM should be 10e8",
    )

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    // Now let's do some trading from another account
    await underlyingToken.mint(aliceAccount, 1e8)
    await underlyingToken.approve(deployedAmm.address, 1e8, {
      from: aliceAccount,
    })

    let optionPrice = blackScholes(
      UNDERLYING_PRICE,
      STRIKE_PRICE,
      ONE_WEEK_DURATION,
      ANNUALIZED_VOLATILITY + VOLATILITY_BUMP,
      "call",
    )
    // Check that AMM calculates correct bToken price
    assertBNEqWithTolerance(
      await deployedAmm.getPriceForSeries(seriesId),
      optionPrice * 1e18,
      PRICE_TOLERANCE,
      "AMM should calculate bToken price correctly",
    )

    await setNextBlockTimestamp(startTime + 10)

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(seriesId, 3e8, 3e8, {
      from: aliceAccount,
    })

    let ammCollateral = 10e8 - 3e8 + optionPrice * 3e8

    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      3e8,
      "Trader should receive purchased bTokens",
    )
    assertBNEqWithTolerance(
      await underlyingToken.balanceOf(aliceAccount),
      1e8 - optionPrice * 3e8,
      PRICE_TOLERANCE,
      "Trader should pay correct collateral amount",
    )
    assertBNEqWithTolerance(
      await underlyingToken.balanceOf(deployedAmm.address),
      ammCollateral,
      PRICE_TOLERANCE,
      "AMM should have correct collateral amount left",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      3e8, // same amount as bTokens bought
      "AMM should have correct amount of residual wTokens",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      0,
      "No residual bTokens should be in the AMM",
    )
    assertBNEqWithTolerance(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      ammCollateral + 3e8 * (1 - optionPrice), // collateral + wTokens
      PRICE_TOLERANCE,
      "Total assets value in the AMM should be correct",
    )

    // Now that the total pool value is 1000024802...
    // If another user deposits another 1k collateral, it should increase pool value
    // by ~9.9% and mint correct amount of LP tokens
    await underlyingToken.mint(bobAccount, 1e8)
    await underlyingToken.approve(deployedAmm.address, 1e8, {
      from: bobAccount,
    })

    await setNextBlockTimestamp(startTime + 20)

    // Provide capital
    ret = await deployedAmm.provideCapital(1e8, 0, { from: bobAccount })

    expectEvent(ret, "LpTokensMinted", {
      minter: bobAccount,
      collateralAdded: (1e8).toString(),
      lpTokensMinted: "99566091",
    })

    assertBNEq(
      await lpToken.balanceOf(bobAccount),
      99566091,
      "lp tokens should have been minted",
    )

    // Check getOptionTokensSaleValue calculation
    // this value comes from:
    //
    // 7116 + 1000 = 8116 collateral in AMM
    // 996 lpTokens owned by bobAccount
    // 10996 total supply of lpTokens
    // (8116 * 996) / 10996 ~= 736
    // 998 collateral would be removed by the .withdrawCapital below
    // 998 - 736 ~= 260
    const tokensSaleValue =
      await deployedAmmDataProvider.getOptionTokensSaleValueView(
        deployedAmm.address,
        993,
      )
    assertBNEq(
      tokensSaleValue,
      260,
      "tokensSaleValue should be calculated correctly",
    )

    await setNextBlockTimestamp(startTime + 30)

    // Now let's withdraw all Bobs tokens to make sure Bob doesn't make money by simply
    // depositing and withdrawing collateral
    ret = await deployedAmm.withdrawCapital(99566091, true, 99963286, {
      from: bobAccount,
    })

    // Check the math
    expectEvent(ret, "LpTokensBurned", {
      redeemer: bobAccount,
      collateralRemoved: "99963286",
      lpTokensBurned: "99566091",
    })
    assertBNEq(
      await underlyingToken.balanceOf(bobAccount),
      99963286, // 99963286 < 1e8 - Bob lost some money, this is good!
      "Bob should lose some money on subsequent withdrawal",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(bobAccount, wTokenIndex),
      0,
      "No wTokens should be sent during partial withdrawal",
    )

    await setNextBlockTimestamp(startTime + 40)

    // Now let's withdraw all collateral
    // notice how the first/longest LP ends up with 7.1e8 collateral + 3e8 wTokens
    // on 10e8 initial investment - not bad if those wTokens expire unexercised
    ret = await deployedAmm.withdrawCapital(10e8, false, 0, {
      from: ownerAccount,
    })

    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "715996469",
      lpTokensBurned: (10e8).toString(),
    })
    assertBNEq(
      await deployedWTokenVault.getWTokenBalance(deployedAmm.address, seriesId),
      3e8,
      "Residual wTokens should be locked during full withdrawal",
    )

    // Make sure no tokens is left in the AMM
    assertBNEq(
      await underlyingToken.balanceOf(deployedAmm.address),
      0,
      "No collateral token should be left in the AMM",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      3e8,
      "Locked wTokens should be left in the AMM",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      0,
      "No bToken should be left in the AMM",
    )
  })

  it("Buys and sells bTokens", async () => {
    const startTime = expiration - ONE_WEEK_DURATION
    await time.increaseTo(startTime) // use the same time, no matter when this test gets called

    // Providing capital before approving should fail
    await expectRevert.unspecified(deployedAmm.provideCapital(10000, 0))

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000e8)
    await underlyingToken.approve(deployedAmm.address, 10000e8)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000e8, 0)

    let optionPrice = blackScholes(
      UNDERLYING_PRICE,
      STRIKE_PRICE,
      ONE_WEEK_DURATION,
      ANNUALIZED_VOLATILITY + VOLATILITY_BUMP,
      "call",
    )

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "1000000000000",
      lpTokensMinted: "1000000000000",
    })

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      10000e8,
      "Total assets value in the AMM should be 10000e8",
    )

    // Check that AMM calculates correct bToken price
    assertBNEqWithTolerance(
      await deployedAmm.getPriceForSeries(seriesId),
      optionPrice * 1e18,
      PRICE_TOLERANCE,
      "AMM should calculate bToken price correctly",
    )

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    // Approve collateral
    await underlyingToken.mint(aliceAccount, 10e8)
    await underlyingToken.approve(deployedAmm.address, 10e8, {
      from: aliceAccount,
    })

    // Verify it fails if the amount of collateral maximum is exceeded
    await expectRevert(
      deployedAmm.bTokenBuy(seriesId, 10e8, 3.8e7, { from: aliceAccount }),
      ERROR_MESSAGES.B_TOKEN_BUY_SLIPPAGE,
    )

    await setNextBlockTimestamp(startTime + 10)

    // Buys success
    ret = await deployedAmm.bTokenBuy(seriesId, 10e8, 3.9e7, {
      from: aliceAccount,
    })

    // Formula: 1/2 * (sqrt((Rr + Rc - Δr)^2 + 4 * Δr * Rc) + Δr - Rr - Rc) - fee
    expectEvent(ret, "BTokensBought", {
      buyer: aliceAccount,
      bTokensBought: "1000000000",
      collateralPaid: "38708622", // is more than 0.0386 * 10e8 (price without slippage)
    })

    // Now lets have alice sell roughly half the bTokens back... since she just pushed the bToken
    // price up with the last purchase it should be a better deal to get a smaller amount out.
    const wTokenAmmBalance = await deployedERC1155Controller.balanceOf(
      deployedAmm.address,
      wTokenIndex,
    )
    const bTokenAmmBalance = await deployedERC1155Controller.balanceOf(
      deployedAmm.address,
      bTokenIndex,
    )
    assertBNEq(
      bTokenAmmBalance,
      0, // no residual bToken balance
      `AMM should have no residual bToken`,
    )
    assertBNEq(
      wTokenAmmBalance,
      10e8, // same as bTokens bought
      `Invalid wTokenAmmBalance ${wTokenAmmBalance.toString()}`,
    )

    const bTokensToSell = "500000000" // sell half

    // Approve bTokens to trade for collateral
    await deployedERC1155Controller.setApprovalForAll(
      deployedAmm.address,
      true,
      {
        from: aliceAccount,
      },
    )

    // Verify it fails if the amount of collateral minimum is not met
    await expectRevert(
      deployedAmm.bTokenSell(seriesId, bTokensToSell, 2e7, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.B_TOKEN_SELL_SLIPPAGE,
    )

    await setNextBlockTimestamp(startTime + 20)

    // Sell success
    ret = await deployedAmm.bTokenSell(seriesId, bTokensToSell, 1.4e7, {
      from: aliceAccount,
    })

    expectEvent(ret, "BTokensSold", {
      seller: aliceAccount,
      bTokensSold: bTokensToSell,
      collateralPaid: "19327329", // worse than no-slippage price of 19341500
    })
    assertBNEq(
      await underlyingToken.balanceOf(aliceAccount),
      980618707, // returned original collateral minus slippage
      "Trader should have correct collateralToken balance after the trade",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      500000000,
      "Trader should have half of bTokens bTokens left",
    )

    await setNextBlockTimestamp(startTime + 30)

    // Sell the rest
    ret = await deployedAmm.bTokenSell(seriesId, bTokensToSell, 1e7, {
      from: aliceAccount,
    })

    assertBNEq(
      await underlyingToken.balanceOf(aliceAccount),
      999945700, // returned original collateral minus slippage
      "Trader should have almost all of their collateralToken back",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      0, // returned original collateral minus slippage
      "Trader should have no bTokens left",
    )
  })

  it("Withdraws large share of LP tokens", async () => {
    const startTime = expiration - ONE_WEEK_DURATION
    await time.increaseTo(startTime) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 1000e8)
    await underlyingToken.approve(deployedAmm.address, 1000e8)

    // Provide capital
    let ret = await deployedAmm.provideCapital(1000e8, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "100000000000",
      lpTokensMinted: "100000000000",
    })

    // Do large trading to produce residual wTokens
    await underlyingToken.mint(aliceAccount, 500e8)
    await underlyingToken.approve(deployedAmm.address, 500e8, {
      from: aliceAccount,
    })

    await setNextBlockTimestamp(startTime + 10)

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(seriesId, 500e8, 500e8, {
      from: aliceAccount,
    })
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      500e8,
      "AMM should have residual wTokens",
    )

    // Check pool value before withdrawal
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      "101563293153", // 1015e8 per 1000e8 LP tokens - looks right
      "Total assets value in the AMM should be correct",
    )

    // Ensure that collateralMinimum is enforced when sellTokens = true
    await expectRevert(
      deployedAmm.withdrawCapital(999e8, true, 0),
      ERROR_MESSAGES.WITHDRAW_COLLATERAL_MINIMUM,
    )

    // Now let's withdraw a very large portion of the pool, but not everything
    // with sellTokens enabled. It should revert due to slippage
    await expectRevert(
      deployedAmm.withdrawCapital(999e8, true, 999e8),
      ERROR_MESSAGES.WITHDRAW_SLIPPAGE,
    )

    await setNextBlockTimestamp(startTime + 20)

    // Now withdraw with auto sale disabled
    ret = await deployedAmm.withdrawCapital(999e8, false, 0)
    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "53443438767", // 0.53 collateral/token
      lpTokensBurned: "99900000000",
    })

    // Check wToken balance withdrawn
    assertBNEq(
      await deployedWTokenVault.getWTokenBalance(deployedAmm.address, seriesId),
      "49950000000", // 499e8
      "WTokenVault should have correct wToken balance",
    )

    // Check pool value after withdrawal
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      "101563309", // 1.01 per 1 LP tokens - looks right
      "Total assets value in the AMM should be correct",
    )
  })

  it("Sells more bTokens than wTokens in the pool", async () => {
    const startTime = expiration - ONE_WEEK_DURATION
    await time.increaseTo(startTime) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 1000e8)
    await underlyingToken.approve(deployedAmm.address, 1000e8)

    // Provide capital
    let ret = await deployedAmm.provideCapital(1000e8, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "100000000000",
      lpTokensMinted: "100000000000",
    })

    let tradeCost = 202712891

    // Do large trading to produce residual wTokens
    await underlyingToken.mint(aliceAccount, tradeCost)
    await underlyingToken.approve(deployedAmm.address, tradeCost, {
      from: aliceAccount,
    })

    await setNextBlockTimestamp(startTime + 10)

    // Buy bTokens (0.0386 * 50e8 + price impact)
    ret = await deployedAmm.bTokenBuy(seriesId, 50e8, tradeCost, {
      from: aliceAccount,
    })

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      50e8,
      "AMM should have residual wTokens",
    )

    assertBNEq(
      await underlyingToken.balanceOf(aliceAccount),
      0,
      "Trader should have correct collateral balance",
    )

    await setNextBlockTimestamp(startTime + 20)

    // Now withdraw most of it with auto sale disabled
    ret = await deployedAmm.withdrawCapital(999e8, false, 0)
    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "95107510178",
      lpTokensBurned: "99900000000",
    })

    // Check wToken balance withdrawn
    assertBNEq(
      await deployedWTokenVault.getWTokenBalance(deployedAmm.address, seriesId),
      "4995000000", // 499e8
      "WTokenVault should have correct wToken balance",
    )

    // Check wToken balance left in the pool
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      "5000000000", // 0.05e8 + 499e8
      "AMM should have correct wToken balance",
    )

    // Sell all bTokens back to the AMM
    await deployedERC1155Controller.setApprovalForAll(
      deployedAmm.address,
      true,
      {
        from: aliceAccount,
      },
    )

    await setNextBlockTimestamp(startTime + 30)
    // First sell almost all bTokens
    ret = await deployedAmm.bTokenSell(seriesId, 49e8, 0, {
      from: aliceAccount,
    })
    expectEvent(ret, "BTokensSold", {
      seller: aliceAccount,
      bTokensSold: (49e8).toString(),
      collateralPaid: "3756723", // 0.0007
    })
    await setNextBlockTimestamp(startTime + 40)

    // Then sell the rest
    ret = await deployedAmm.bTokenSell(seriesId, 1e8, 0, {
      from: aliceAccount,
    })
    expectEvent(ret, "BTokensSold", {
      seller: aliceAccount,
      bTokensSold: (1e8).toString(),
      collateralPaid: "1943147", // 0.019
    })

    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      "0", // 49e8
      "AMM should have no residual bTokens",
    )
    assertBNEq(
      await underlyingToken.balanceOf(aliceAccount),
      "5699870", // lost 1.97e8 on price impact
      "Trader should have correct collateral balance",
    )
  })

  it("Works in initial state", async () => {
    assertBNEq(
      // @ts-ignore
      (await deployedAmm.getAllSeries()).length,
      1,
      "Number of series should be 1",
    )

    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      0,
      "Initial pool value should be 0",
    )

    const unredeemedCollateral =
      await deployedAmmDataProvider.getCollateralValueOfAllExpiredOptionTokensView(
        deployedAmm.address,
      )
    assertBNEq(
      unredeemedCollateral,
      0,
      "Initial unredeemedCollateral should be 0",
    )

    assertBNEq(
      await deployedAmmDataProvider.getOptionTokensSaleValueView(
        deployedAmm.address,
        0,
      ),
      0,
      "Initial token sale value should be 0",
    )

    assertBNEq(
      await deployedAmmDataProvider.getOptionTokensSaleValueView(
        deployedAmm.address,
        100,
      ),
      0,
      "Initial token sale value should be 0",
    )
  })

  it("should calculate correct total pool value with multiple expired ITM series", async () => {
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    const laterExpirationDate = expiration + ONE_WEEK_DURATION

    // make a second series
    const { seriesId: anotherSeriesIndex } = await setupSeries({
      deployedSeriesController,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration: laterExpirationDate,
      restrictedMinters: [deployedAmm.address],
      strikePrice: STRIKE_PRICE.toString(),
      isPutOption: false,
    })

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000)
    await underlyingToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ammReceipt = await deployedAmm.provideCapital(10000, 0)

    expectEvent(ammReceipt, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "10000",
      lpTokensMinted: "10000",
    })

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

    // Now let's do some trading from another account
    await underlyingToken.mint(aliceAccount, 1000)
    await underlyingToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    let optionPrice = blackScholes(
      UNDERLYING_PRICE,
      STRIKE_PRICE,
      ONE_WEEK_DURATION,
      ANNUALIZED_VOLATILITY + VOLATILITY_BUMP,
      "call",
    )

    // Check that AMM calculates correct bToken price
    assertBNEqWithTolerance(
      await deployedAmm.getPriceForSeries(seriesId),
      optionPrice * 1e18, // 0.0386 * 1e18
      PRICE_TOLERANCE,
      "AMM should calculate bToken price correctly",
    )

    // Buy bTokens
    await deployedAmm.bTokenBuy(seriesId, 3000, 3000, {
      from: aliceAccount,
    })
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      3000,
      "Trader should receive purchased bTokens",
    )
    assertBNEq(
      await underlyingToken.balanceOf(aliceAccount),
      841, // paid 159 for 3000 tokens at ~0.038 + slippage
      "Trader should pay correct collateral amount",
    )
    assertBNEq(
      await underlyingToken.balanceOf(deployedAmm.address),
      7159, // 10000 - 3000 + 159
      "AMM should have correct collateral amount left",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      3000, // same amount as bTokens bought
      "AMM should have correct amount of residual wTokens",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      0,
      "No residual bTokens should be in the AMM",
    )
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      10042, // 7159 + 3000 * (1 - 0.0386) (btw, 10042 > 10000 - LPs are making money!!!)
      "Total assets value in the AMM should be correct",
    )

    // Buy bTokens on the other series

    const anotherBTokenIndex = await deployedSeriesController.bTokenIndex(
      anotherSeriesIndex,
    )
    const anotherWTokenIndex = await deployedSeriesController.wTokenIndex(
      anotherSeriesIndex,
    )

    // Check that AMM calculates correct bToken price
    assertBNEq(
      await deployedAmm.getPriceForSeries(anotherSeriesIndex),
      "65274048842692143", // 0.065 * 1e18
      "AMM should calculate bToken price correctly",
    )

    await deployedAmm.bTokenBuy(anotherSeriesIndex, 3000, 3000, {
      from: aliceAccount,
    })
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        aliceAccount,
        anotherBTokenIndex,
      ),
      3000,
      "Trader should receive purchased bTokens",
    )
    assertBNEq(
      (await underlyingToken.balanceOf(aliceAccount)).toNumber(),
      540, // at price of ~0.065 paid 301 total; 195 for 3000 tokens, plus 106 from slippage (841 - 301 = 540)
      "Trader should pay correct collateral amount",
    )
    assertBNEq(
      (await underlyingToken.balanceOf(deployedAmm.address)).toNumber(),
      4460, // 10000 - 3000 + 159 - 3000 + 301
      "AMM should have correct collateral amount left",
    )
    assertBNEq(
      (
        await deployedERC1155Controller.balanceOf(
          deployedAmm.address,
          anotherWTokenIndex,
        )
      ).toNumber(),
      3000, // same amount as bTokens bought
      "AMM should have correct amount of residual wTokens",
    )
    assertBNEq(
      (
        await deployedERC1155Controller.balanceOf(
          deployedAmm.address,
          anotherBTokenIndex,
        )
      ).toNumber(),
      0,
      "No residual bTokens should be in the AMM",
    )

    // make both series expired, so we can test getTotalPoolValue
    // with expired bTokens and wTokens

    await time.increaseTo(laterExpirationDate)

    // set the settlementPrice such that the options are ITM
    await deployedMockPriceOracle.setLatestAnswer(ITM_BTC_ORACLE_PRICE)
    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    assertBNEq(
      (
        await deployedAmmDataProvider.getTotalPoolValueView(
          deployedAmm.address,
          true,
        )
      ).toNumber(),
      8960, // 4460 (collateral) + (3000 * (15_000 / 20_000)) (wToken)
      // + (3000 * (15_000 / 20_000)) (anotherWToken)
      "Total assets value in the AMM should be correct",
    )
  })

  it("Verifies partial bToken minting", async () => {
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000e10)
    await underlyingToken.approve(deployedAmm.address, 10000e10)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000e10, 0)

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    // Now let's do some trading from another account
    await underlyingToken.mint(aliceAccount, 10000e10)
    await underlyingToken.approve(deployedAmm.address, 3000e10, {
      from: aliceAccount,
    })

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(seriesId, 3000e10, 3000e10, {
      from: aliceAccount,
    })

    // Move some bTokens into the AMM to simulate partial bToken minting
    await deployedERC1155Controller.safeTransferFrom(
      aliceAccount,
      deployedAmm.address,
      bTokenIndex,
      500,
      "0x0",
      { from: aliceAccount },
    )

    // Now have Alice buy some more
    await underlyingToken.mint(aliceAccount, 10e8)
    await underlyingToken.approve(deployedAmm.address, 10e8, {
      from: aliceAccount,
    })

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(seriesId, 10e8, 10e8, {
      from: aliceAccount,
    })

    // Verify there is no outstanding approval
    const approval = await underlyingToken.allowance(
      deployedAmm.address,
      deployedSeriesController.address,
    )
    assertBNEq(approval, 0, "No left over approval should be there")
  })

  it("Verifies check for trade size", async () => {
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000e10)
    await underlyingToken.approve(deployedAmm.address, 10000e10)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000e10, 0)

    // Now let's do some trading from another account
    await underlyingToken.mint(aliceAccount, 1000)
    await underlyingToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Buy bTokens
    // Verify it fails if the amount of collateral maximum is exceeded
    await expectRevert(
      deployedAmm.bTokenBuy(seriesId, 1000, 1000, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.B_TOKEN_BUY_NOT_LARGE_ENOUGH,
    )
  })
})
