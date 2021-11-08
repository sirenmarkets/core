/* global artifacts contract it assert */
import { time, expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract, ethers } from "hardhat"
import { BigNumber } from "@ethersproject/bignumber"
const { provider } = ethers
import {
  SimpleTokenContract,
  MockPriceOracleInstance,
  PriceOracleInstance,
  SimpleTokenInstance,
  MinterAmmInstance,
  SeriesControllerInstance,
  ERC1155ControllerInstance,
  MockPriceOracleContract,
  MockVolatilityPriceOracleInstance,
  AddressesProviderInstance,
} from "../../typechain"

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

import {
  assertBNEq,
  checkBalances,
  setupAllTestContracts,
  setupSeries,
  setupMockVolatilityPriceOracle,
  ONE_WEEK_DURATION,
} from "../util"

let deployedSeriesController: SeriesControllerInstance
let deployedERC1155Controller: ERC1155ControllerInstance
let deployedAmm: MinterAmmInstance
let deployedMockPriceOracle: MockPriceOracleInstance
let deployedPriceOracle: PriceOracleInstance
let deployedMockVolatilityPriceOracle: MockVolatilityPriceOracleInstance
let deployedAddressesProvider: AddressesProviderInstance

let deployedVolatilityOracle
let deployedMockVolatilityOracle

const wbtcDecimals = 8

const MockPriceOracle: MockPriceOracleContract =
  artifacts.require("MockPriceOracle")

let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance
let collateralToken: SimpleTokenInstance
let PERIOD = 86400
const WINDOW_IN_DAYS = 90 // 3 month vol data

let expiration: number
let seriesId: string

const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const OTM_BTC_ORACLE_PRICE = 14_000 * 10 ** 8
const ITM_BTC_ORACLE_PRICE = 20_000 * 10 ** 8

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
      expiration,
      deployedAddressesProvider,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: OTM_BTC_ORACLE_PRICE,
    }))

    underlyingToken = await SimpleToken.new()
    await underlyingToken.initialize("Wrapped BTC", "WBTC", wbtcDecimals)

    priceToken = await SimpleToken.new()
    await priceToken.initialize("USD Coin", "USDC", 6)

    // create the price oracle fresh for each test
    deployedMockPriceOracle = await MockPriceOracle.new(wbtcDecimals)

    const humanCollateralPrice2 = new BN(22_000 * 10 ** 8) // 22k

    await deployedMockPriceOracle.setLatestAnswer(humanCollateralPrice2)
    deployedMockVolatilityPriceOracle = await setupMockVolatilityPriceOracle(
      underlyingToken.address,
      priceToken.address,
      deployedMockPriceOracle.address,
    )

    const volatility = await ethers.getContractFactory("VolatilityOracle", {})

    const MockVolatility = await ethers.getContractFactory(
      "MockVolatilityOracle",
      {},
    )

    deployedVolatilityOracle = await volatility.deploy(
      PERIOD,
      deployedMockVolatilityPriceOracle.address,
      WINDOW_IN_DAYS,
    )
    deployedMockVolatilityOracle = await MockVolatility.deploy(
      PERIOD,
      deployedMockVolatilityPriceOracle.address,
      WINDOW_IN_DAYS,
    )

    deployedAddressesProvider.setVolatilityOracle(
      deployedMockVolatilityOracle.address,
    )

    const values = [
      BigNumber.from("2000000000"),
      BigNumber.from("2100000000"),
      BigNumber.from("2200000000"),
      BigNumber.from("2150000000"),
    ]
    const stdevs = [
      BigNumber.from("0"),
      BigNumber.from("2439508"),
      BigNumber.from("2248393"),
      BigNumber.from("3068199"),
    ]

    const topOfPeriod = (await getTopOfPeriod()) + PERIOD
    await time.increaseTo(topOfPeriod)

    await deployedMockVolatilityOracle.initPool(
      underlyingToken.address,
      priceToken.address,
    )
  })

  it("Provides capital without trading", async () => {
    // Providing capital before approving should fail
    await expectRevert.unspecified(deployedAmm.provideCapital(10000, 0))

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 1000000000)
    await underlyingToken.approve(deployedAmm.address, 1000000)

    await underlyingToken.mint(aliceAccount, 1000)
    // Provide capital
    let ret = await deployedAmm.provideCapital(100, 0, { from: aliceAccount })

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
      await deployedAmm.getTotalPoolValue(true),
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
      await deployedAmm.getTotalPoolValue(true),
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
    ret = await deployedAmm.withdrawCapital(10000, true, 10000)

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
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

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

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmm.getTotalPoolValue(true),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    // Now let's do some trading from another account
    await underlyingToken.mint(aliceAccount, 1000)
    await underlyingToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Check that AMM calculates correct bToken price
    assertBNEq(
      await deployedAmm.getPriceForSeries(seriesId),
      "2927196112142857", // 0.0029 * 1e18
      "AMM should calculate bToken price correctly",
    )

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(seriesId, 3000, 3000, {
      from: aliceAccount,
    })
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      3000,
      "Trader should receive purchased bTokens",
    )
    assertBNEq(
      await underlyingToken.balanceOf(aliceAccount),
      880, // paid 120 for 3000 tokens at ~0.029 + slippage
      "Trader should pay correct collateral amount",
    )
    assertBNEq(
      await underlyingToken.balanceOf(deployedAmm.address),
      7120, // 10000 - 3000 + 120
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
      await deployedAmm.getTotalPoolValue(true),
      10032, // 7120 + 3000 * (1 - 0.029) (btw, 10032 > 10000 - LPs are making money!!!)
      "Total assets value in the AMM should be correct",
    )

    // Now that the total pool value is 10032...
    // If another user deposits another 1k collateral, it should increase pool value
    // by ~9.9% and mint correct amount of LP tokens
    await underlyingToken.mint(bobAccount, 1000)
    await underlyingToken.approve(deployedAmm.address, 1000, {
      from: bobAccount,
    })

    // Provide capital
    ret = await deployedAmm.provideCapital(1000, 0, { from: bobAccount })

    expectEvent(ret, "LpTokensMinted", {
      minter: bobAccount,
      collateralAdded: "1000",
      lpTokensMinted: "996",
    })

    assertBNEq(
      await lpToken.balanceOf(bobAccount),
      996,
      "lp tokens should have been minted",
    )

    // Check getOptionTokensSaleValue calculation
    // this value comes from:
    //
    // 7120 + 1000 = 8120 collateral in AMM
    // 996 lpTokens owned by bobAccount
    // 10996 total supply of lpTokens
    // (8120 * 996) / 10996 ~= 736
    // 998 collateral would be removed by the .withdrawCapital below
    // 998 - 736 = 262
    const tokensSaleValue = await deployedAmm.getOptionTokensSaleValue(993)
    assertBNEq(
      tokensSaleValue,
      262,
      "tokensSaleValue should be calculated correctly",
    )

    // Now let's withdraw all Bobs tokens to make sure Bob doesn't make money by simply
    // depositing and withdrawing collateral
    ret = await deployedAmm.withdrawCapital(996, true, 998, {
      from: bobAccount,
    })

    // Check the math
    expectEvent(ret, "LpTokensBurned", {
      redeemer: bobAccount,
      collateralRemoved: "998",
      lpTokensBurned: "996",
    })
    assertBNEq(
      await underlyingToken.balanceOf(bobAccount),
      998, // 998 < 1000 - Bob lost some money, this is good!
      "Bob should lose some money on subsequent withdrawal",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(bobAccount, wTokenIndex),
      0,
      "No wTokens should be sent during partial withdrawal",
    )

    // Now let's withdraw all collateral
    // notice how the first/longest LP ends up with 7120 collateral + 3000 wTokens
    // on 10000 initial investment - not bad if those wTokens expire unexercised
    ret = await deployedAmm.withdrawCapital(10000, false, 0, {
      from: ownerAccount,
    })

    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "7122",
      lpTokensBurned: "10000",
    })
    assertBNEq(
      await deployedERC1155Controller.balanceOf(ownerAccount, wTokenIndex),
      3000,
      "Residual wTokens should be sent during full withdrawal",
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
      0,
      "No wToken should be left in the AMM",
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
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    // Providing capital before approving should fail
    await expectRevert.unspecified(deployedAmm.provideCapital(10000, 0))

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000e8)
    await underlyingToken.approve(deployedAmm.address, 10000e8)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000e8, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "1000000000000",
      lpTokensMinted: "1000000000000",
    })

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmm.getTotalPoolValue(true),
      10000e8,
      "Total assets value in the AMM should be 10000e8",
    )

    // Check that AMM calculates correct bToken price
    assertBNEq(
      await deployedAmm.getPriceForSeries(seriesId),
      "2927206551428571", // 0.0029 * 1e18
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
      deployedAmm.bTokenBuy(seriesId, 10e8, 2.9e7, { from: aliceAccount }),
      ERROR_MESSAGES.B_TOKEN_BUY_SLIPPAGE,
    )

    // Buys success
    ret = await deployedAmm.bTokenBuy(seriesId, 10e8, 3e7, {
      from: aliceAccount,
    })

    // Formula: 1/2 * (sqrt((Rr + Rc - Δr)^2 + 4 * Δr * Rc) + Δr - Rr - Rc) - fee
    expectEvent(ret, "BTokensBought", {
      buyer: aliceAccount,
      bTokensBought: "1000000000",
      collateralPaid: "29035374", // is more than 29008000 (price without slippage)
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

    // Sell success
    ret = await deployedAmm.bTokenSell(seriesId, bTokensToSell, 1.4e7, {
      from: aliceAccount,
    })

    expectEvent(ret, "BTokensSold", {
      seller: aliceAccount,
      bTokensSold: bTokensToSell,
      collateralPaid: "14497159", // worse than no-slippage price of 30034666.67
    })
    assertBNEq(
      await underlyingToken.balanceOf(aliceAccount),
      985461785, // returned original collateral minus slippage
      "Trader should have correct collateralToken balance after the trade",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      500000000,
      "Trader should have half of bTokens bTokens left",
    )

    // Sell the rest
    ret = await deployedAmm.bTokenSell(seriesId, bTokensToSell, 1e7, {
      from: aliceAccount,
    })

    assertBNEq(
      await underlyingToken.balanceOf(aliceAccount),
      999958947, // returned original collateral minus slippage
      "Trader should have almost all of their collateralToken back",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      0, // returned original collateral minus slippage
      "Trader should have no bTokens left",
    )
  })

  it("Sells wTokens", async () => {
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called
    // Approve collateral
    await collateralToken.mint(ownerAccount, 1e12)
    await collateralToken.approve(deployedAmm.address, 1e12)

    // Provide capital
    let ret = await deployedAmm.provideCapital(1e12, 0)

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      1e12,
      "Total assets value in the AMM should be 1e12",
    )

    // Check that AMM calculates correct bToken price
    assertBNEq(
      await deployedAmm.getPriceForSeries.call(seriesId),
      "2927176751428571", // 0.0029 * 1e18
      "AMM should calculate bToken price correctly",
    )

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    // Approve collateral
    await collateralToken.mint(aliceAccount, 10e8)
    await collateralToken.approve(deployedAmm.address, 10e8, {
      from: aliceAccount,
    })

    // Buys success
    let bTokensToBuy = 10e8
    ret = await deployedAmm.bTokenBuy(seriesId, bTokensToBuy, 7e7, {
      from: aliceAccount,
    })

    // Formula: 1/2 * (sqrt((Rr + Rc - Δr)^2 + 4 * Δr * Rc) + Δr - Rr - Rc) - fee
    expectEvent(ret, "BTokensBought", {
      buyer: aliceAccount,
      bTokensBought: "1000000000",
      collateralPaid: "29035374", // is more than 29008000 (price without slippage)
    })

    // LP withdraws
    ret = await deployedAmm.withdrawCapital(1e11, false, 1e11)

    let wTokensBalance = bTokensToBuy / 10
    await checkBalances(
      deployedERC1155Controller,
      ownerAccount,
      "Owner",
      collateralToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      99902903537, // 0.1 * (10000e8 + 29035374 - 10e8)
      0,
      wTokensBalance,
      9000e8,
    )

    // Approve wTokens for sale
    await deployedERC1155Controller.setApprovalForAll(deployedAmm.address, true)

    // Verify it fails if the amount of collateral minimum is not met
    await expectRevert(
      deployedAmm.wTokenSell(seriesId, wTokensBalance, 1e8),
      ERROR_MESSAGES.W_TOKEN_SELL_SLIPPAGE,
    )

    // Sell success
    ret = await deployedAmm.wTokenSell(0, wTokensBalance, 5e7)

    expectEvent(ret, "WTokensSold", {
      seller: ownerAccount,
      wTokensSold: wTokensBalance.toString(),
      collateralPaid: "97098896", // ~ 1e8 * (1 - 0.029) minus slippage
    })

    await checkBalances(
      deployedERC1155Controller,
      ownerAccount,
      "Owner",
      collateralToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      99902903537 + 97098896, // 100000002433
      0,
      0,
      9000e8,
    )

    // Ensure LP doesn't make money by withdrawing immediately
    await checkBalances(
      deployedERC1155Controller,
      deployedAmm.address,
      "AMM",
      collateralToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      899029032941, // 899029032941 + 100000004720 = 999029037661 < 1e12 - LP doesn't make instant cash
      0,
      bTokensToBuy,
      0,
    )
  })

  it("Withdraws large share of LP tokens", async () => {
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

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
      await deployedAmm.getTotalPoolValue(true),
      "100143832487", // 1012e8 per 1000e8 LP tokens - looks right
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

    // Now withdraw with auto sale disabled
    ret = await deployedAmm.withdrawCapital(999e8, false, 0)
    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "52630473943", // 0.52 collateral/token
      lpTokensBurned: "99900000000",
    })

    // Check wToken balance withdrawn
    assertBNEq(
      await deployedERC1155Controller.balanceOf(ownerAccount, wTokenIndex),
      "49950000000", // 499e8
      "Owner should have correct wToken balance",
    )

    // Check pool value after withdrawal
    assertBNEq(
      await deployedAmm.getTotalPoolValue(true),
      "101232758", // 1.01 per 1 LP tokens - looks right
      "Total assets value in the AMM should be correct",
    )
  })

  it("Sells more bTokens than wTokens in the pool", async () => {
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

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
    await underlyingToken.mint(aliceAccount, 2683157101)
    await underlyingToken.approve(deployedAmm.address, 2683157101, {
      from: aliceAccount,
    })

    // Buy bTokens (26.8e8 collateral cost)
    ret = await deployedAmm.bTokenBuy(seriesId, 1000e8, 2683157101, {
      from: aliceAccount,
    })

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      500e8,
      "AMM should have residual wTokens",
    )

    assertBNEq(
      await underlyingToken.balanceOf(aliceAccount),
      0,
      "Trader should have correct collateral balance",
    )

    // Now withdraw most of it with auto sale disabled
    ret = await deployedAmm.withdrawCapital(999e8, false, 0)
    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "52630473943",
      lpTokensBurned: "99900000000",
    })

    // Check wToken balance withdrawn
    assertBNEq(
      await deployedERC1155Controller.balanceOf(ownerAccount, wTokenIndex),
      "49950000000", // 499e8
      "Owner should have correct wToken balance",
    )

    // Check wToken balance left in the pool
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      "50000000", // 0.5e8
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
    // First sell almost all bTokens
    ret = await deployedAmm.bTokenSell(seriesId, 499e8, 0, {
      from: aliceAccount,
    })
    // Then sell the rest
    ret = await deployedAmm.bTokenSell(seriesId, 1e8, 0, {
      from: aliceAccount,
    })
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      "49950000000", // 499e8
      "AMM should have residual bTokens",
    )
    assertBNEq(
      await underlyingToken.balanceOf(aliceAccount),
      "4394348", // lost 26e8 on slippage
      "Trader should have correct collateral balance",
    )
  })

  it("Enforces minimum trade size", async () => {
    // Verify it fails if min trade size is not met
    const minTradeSize = 1000
    await expectRevert(
      deployedAmm.bTokenBuy(seriesId, minTradeSize - 1, 1, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.MIN_TRADE_SIZE,
    )
    await expectRevert(
      deployedAmm.bTokenSell(seriesId, minTradeSize - 1, 1, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.MIN_TRADE_SIZE,
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
      await deployedAmm.getTotalPoolValue(true),
      0,
      "Initial pool value should be 0",
    )

    const unredeemedCollateral =
      await deployedAmm.getCollateralValueOfAllExpiredOptionTokens()
    assertBNEq(
      unredeemedCollateral,
      0,
      "Initial unredeemedCollateral should be 0",
    )

    assertBNEq(
      await deployedAmm.getOptionTokensSaleValue(0),
      0,
      "Initial token sale value should be 0",
    )

    assertBNEq(
      await deployedAmm.getOptionTokensSaleValue(100),
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
      await deployedAmm.getTotalPoolValue(true),
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

    // Check that AMM calculates correct bToken price
    assertBNEq(
      await deployedAmm.getPriceForSeries(seriesId),
      "2927225405000000", // 0.0029 * 1e18
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
      880, // paid 120 for 3000 tokens at ~0.029 + slippage
      "Trader should pay correct collateral amount",
    )
    assertBNEq(
      await underlyingToken.balanceOf(deployedAmm.address),
      7120, // 10000 - 3000 + 120
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
      await deployedAmm.getTotalPoolValue(true),
      10032, // 7120 + 3000 * (1 - 0.029) (btw, 10032 > 10000 - LPs are making money!!!)
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
      "41029333333333333", // 0.041 * 1e18
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
      683, // at price of ~0.041 paid 197 total; 120 for 3000 tokens, plus 77 from slippage (880 - (120 + 77) = 683)
      "Trader should pay correct collateral amount",
    )
    assertBNEq(
      (await underlyingToken.balanceOf(deployedAmm.address)).toNumber(),
      4317, // 10000 - 3000 + 120 - 3000 + 197
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
      (await deployedAmm.getTotalPoolValue(true)).toNumber(),
      8817, // 4317 (collateral) + (3000 * (15_000 / 20_000)) (wToken)
      // + (3000 * (15_000 / 20_000)) (anotherWToken)
      "Total assets value in the AMM should be correct",
    )

    // simulate the AMM having expired ITM bTokens by having alice
    // send some to the AMM, and make sure the total pool value
    // rises by the correct amount
    await deployedERC1155Controller.safeTransferFrom(
      aliceAccount,
      deployedAmm.address,
      bTokenIndex,
      1000,
      "0x0",
      { from: aliceAccount },
    )
    await deployedERC1155Controller.safeTransferFrom(
      aliceAccount,
      deployedAmm.address,
      anotherBTokenIndex,
      1000,
      "0x0",
      { from: aliceAccount },
    )

    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toNumber(),
      9317, // 8817 (previous pool value) + (1000 - (1000 * (15_000 / 20_000))) (bToken)
      // + (1000 - (1000 * (15_000 / 20_000))) (anotherBToken)
      "Total assets value in the AMM should be correct",
    )
  })

  it("Verifies partial bToken minting", async () => {
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 1000000)
    await underlyingToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000, 0)

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    // Now let's do some trading from another account
    await underlyingToken.mint(aliceAccount, 100000)
    await underlyingToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(seriesId, 3000, 3000, {
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
    await underlyingToken.mint(aliceAccount, 100000)
    await underlyingToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(seriesId, 1000, 1000, {
      from: aliceAccount,
    })

    // Verify there is no outstanding approval
    const approval = await underlyingToken.allowance(
      deployedAmm.address,
      deployedSeriesController.address,
    )
    assertBNEq(approval, 0, "No left over approval should be there")
  })
  const getTopOfPeriod = async () => {
    const latestTimestamp = (await provider.getBlock("latest")).timestamp
    let topOfPeriod: number

    const rem = latestTimestamp % PERIOD
    if (rem < Math.floor(PERIOD / 2)) {
      topOfPeriod = latestTimestamp - rem + PERIOD
    } else {
      topOfPeriod = latestTimestamp + rem + PERIOD
    }
    console.log(topOfPeriod)
    return topOfPeriod
  }
})
