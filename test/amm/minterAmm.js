/* global artifacts contract it assert */
const {
  expectRevert,
  expectEvent,
  time,
} = require("@openzeppelin/test-helpers")
const { BN } = require("@openzeppelin/test-helpers/src/setup")
const Market = artifacts.require("Market")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MockPriceOracle = artifacts.require("MockPriceOracle")
const Proxy = artifacts.require("Proxy")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")

const { MarketStyle, getPriceRatio } = require("../util")

const LP_TOKEN_NAME = "WBTC-USDC"
const NAME = "WBTC.USDC.20300101.15000"
const STRIKE_RATIO = getPriceRatio(15000, 8, 6) // 15000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC
const SHOULD_INVERT_ORACLE_PRICE = false

const ERROR_MESSAGES = {
  INIT_ONCE: "Contract can only be initialized once.",
  NOT_SAME_TOKEN_CONTRACTS: "_collateralToken cannot equal _paymentToken",
  W_INVALID_REFUND: "wToken refund amount too high",
  B_INVALID_REFUND: "bToken refund amount too high",
  B_TOKEN_BUY_SLIPPAGE: "bTokenBuy: slippage exceeded",
  B_TOKEN_SELL_SLIPPAGE: "bTokenSell: slippage exceeded",
  W_TOKEN_BUY_SLIPPAGE: "wTokenBuy: slippage exceeded",
  W_TOKEN_SELL_SLIPPAGE: "wTokenSell: slippage exceeded",
  MIN_TRADE_SIZE: "Trade below min size",
  WITHDRAW_SLIPPAGE: "withdrawCapital: Slippage exceeded",
  WITHDRAW_COLLATERAL_MINIMUM: "withdrawCapital: collateralMinimum must be set",
}

/**
 * Testing the flows for the Market Contract
 */
contract("AMM Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  let marketLogic
  let tokenLogic
  let ammLogic
  let lpTokenLogic
  let marketsRegistryLogic

  let deployedMarketsRegistry
  let deployedMockPriceOracle
  let deployedMarket
  let deployedAmm

  let collateralToken
  let paymentToken

  let expiration

  let marketAddress

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    marketLogic = await Market.deployed()
    tokenLogic = await SimpleToken.deployed()
    lpTokenLogic = await SimpleToken.deployed()
    ammLogic = await MinterAmm.deployed()
    marketsRegistryLogic = await MarketsRegistry.deployed()
  })

  beforeEach(async () => {
    // We create payment and collateral tokens before each test
    // in order to prevent balances from one test leaking into another
    // Create a collateral token
    collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    const proxyContract = await Proxy.new(marketsRegistryLogic.address)
    deployedMarketsRegistry = await MarketsRegistry.at(proxyContract.address)
    deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    // deploy the price oracle for the AMM
    deployedMockPriceOracle = await MockPriceOracle.new(
      await collateralToken.decimals.call(),
    )
    await deployedMockPriceOracle.setLatestAnswer(BTC_ORACLE_PRICE)

    // create the AMM we'll use in all the tests
    const ret = await deployedMarketsRegistry.createAmm(
      deployedMockPriceOracle.address,
      paymentToken.address,
      collateralToken.address,
      0,
      SHOULD_INVERT_ORACLE_PRICE,
    )

    expectEvent(ret, "AmmCreated")

    // get the new AMM address from the AmmCreated event
    const ammAddress = ret.logs[2].args["0"]
    deployedAmm = await MinterAmm.at(ammAddress)

    const lpToken = await SimpleToken.at(await deployedAmm.lpToken.call())

    // verify event
    await expectEvent.inTransaction(ret.tx, deployedAmm, "AMMInitialized", {
      lpToken: lpToken.address,
    })

    expiration = Number(await time.latest()) + 30 * 86400 // 30 days from now;

    await deployedMarketsRegistry.createMarket(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO,
      expiration,
      0,
      0,
      0,
      deployedAmm.address,
    )

    const deployedMarketAddress = await deployedMarketsRegistry.markets.call(
      NAME,
    )
    deployedMarket = await Market.at(deployedMarketAddress)
    const openMarkets = await deployedAmm.getMarkets()
    marketAddress = openMarkets[0]
  })

  it("Initializes", async () => {
    assert.equal(
      await deployedAmm.registry.call(),
      deployedMarketsRegistry.address,
      "Registry should be set",
    )

    assert.equal(
      await deployedAmm.tradeFeeBasisPoints.call(),
      0,
      "Fee should be set",
    )

    const lpToken = await SimpleToken.at(await deployedAmm.lpToken.call())
    assert.equal(
      await lpToken.name.call(),
      "LP-" + LP_TOKEN_NAME,
      "LP Name should be set",
    )

    assert.equal(await lpToken.decimals.call(), 8, "LP decimals should be set")

    assert.equal(
      await deployedAmm.collateralToken.call(),
      collateralToken.address,
      "collateral token should be set",
    )

    assert.equal(
      await deployedAmm.paymentToken.call(),
      paymentToken.address,
      "collateral token should be set",
    )

    // Prove that we can't initialize it again
    await expectRevert(
      deployedAmm.initialize(
        deployedMarketsRegistry.address,
        deployedMockPriceOracle.address,
        paymentToken.address,
        collateralToken.address,
        lpTokenLogic.address,
        0,
        SHOULD_INVERT_ORACLE_PRICE,
      ),
      ERROR_MESSAGES.INIT_ONCE,
    )

    // Prove that we can't initialize the AMM with the same values
    // for paymentToken and collateralToken
    await expectRevert(
      deployedMarketsRegistry.createAmm(
        deployedMockPriceOracle.address,
        collateralToken.address,
        collateralToken.address,
        0,
        SHOULD_INVERT_ORACLE_PRICE,
      ),
      ERROR_MESSAGES.NOT_SAME_TOKEN_CONTRACTS,
    )
  })

  it("Provides capital without trading", async () => {
    // Providing capital before approving should fail
    await expectRevert.unspecified(deployedAmm.provideCapital(10000, 0))

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
    assert.equal(
      await collateralToken.balanceOf.call(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 10k collateral should be in the AMM.
    assert.equal(
      await collateralToken.balanceOf.call(deployedAmm.address),
      10000,
      "Collateral should have been used to mint",
    )

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken.call())

    // 0 bTokens should be in the AMM
    assert.equal(
      await bToken.balanceOf.call(deployedAmm.address),
      0,
      "No bTokens should be in the AMM yet",
    )

    // 0 of wTokens should be in the AMM
    assert.equal(
      await wToken.balanceOf.call(deployedAmm.address),
      0,
      "No wTokens should be in the AMM yet",
    )

    // LP tokens should have been given out
    assert.equal(
      await lpToken.balanceOf.call(ownerAccount),
      10000,
      "lp tokens should have been minted",
    )

    // Now there are 10k lpTokens in the AMM...
    // If another user deposits another 1k collateral, it should increase
    // the number of lpTokens by 1000
    await collateralToken.mint(aliceAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Provide capital
    ret = await deployedAmm.provideCapital(1000, 0, { from: aliceAccount })

    expectEvent(ret, "LpTokensMinted", {
      minter: aliceAccount,
      collateralAdded: "1000",
      lpTokensMinted: "1000",
    })

    assert.equal(
      await lpToken.balanceOf.call(aliceAccount),
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
      paymentRemoved: "0",
      lpTokensBurned: "500",
    })
  })

  it("Provides and immediately withdraws capital without trading", async () => {
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
    assert.equal(
      await collateralToken.balanceOf.call(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 10k collateral should be in the AMM.
    assert.equal(
      await collateralToken.balanceOf.call(deployedAmm.address),
      10000,
      "Collateral should have been used to mint",
    )

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken.call())

    // 0 bTokens should be in the AMM
    assert.equal(
      await bToken.balanceOf.call(deployedAmm.address),
      0,
      "No bTokens should be in the AMM yet",
    )

    // 0 of wTokens should be in the AMM
    assert.equal(
      await wToken.balanceOf.call(deployedAmm.address),
      0,
      "No wTokens should be in the AMM yet",
    )

    // LP tokens should have been given out
    assert.equal(
      await lpToken.balanceOf.call(ownerAccount),
      10000,
      "lp tokens should have been minted",
    )

    // Now let's withdraw all of the owner's lpTokens (owner should have 10000 lp tokens)
    ret = await deployedAmm.withdrawCapital(10000, true, 10000)

    // Check the math
    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "10000",
      paymentRemoved: "0",
      lpTokensBurned: "10000",
    })

    // LP tokens should have been given out
    assert.equal(
      await lpToken.balanceOf.call(ownerAccount),
      0,
      "all lp tokens should have been withdraw",
    )

    // Collateral should be moved away from AMM
    assert.equal(
      await collateralToken.balanceOf.call(deployedAmm.address),
      0,
      "AMM should have no collateral",
    )

    // Collateral should be moved to Owner
    assert.equal(
      await collateralToken.balanceOf.call(ownerAccount),
      10000,
      "Owner should have the same amount of collateral they had prior to providing capital",
    )
  })

  it("Provides capital with trading", async () => {
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

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken.call())

    // Now let's do some trading from another account
    await collateralToken.mint(aliceAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Check that AMM calculates correct bToken price
    assert.equal(
      await deployedAmm.getPriceForMarket.call(deployedMarket.address),
      "60069333333333333", // 0.06 * 1e18
      "AMM should calculate bToken price correctly",
    )

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(marketAddress, 3000, 3000, {
      from: aliceAccount,
    })
    assert.equal(
      await bToken.balanceOf.call(aliceAccount),
      3000,
      "Trader should receive purchased bTokens",
    )
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      757, // paid 243 for 3000 tokens at ~0.06 + slippage
      "Trader should pay correct collateral amount",
    )
    assert.equal(
      await collateralToken.balanceOf.call(deployedAmm.address),
      7243, // 10000 - 3000 + 243
      "AMM should have correct collateral amount left",
    )
    assert.equal(
      await wToken.balanceOf.call(deployedAmm.address),
      3000, // same amout as bTokens bought
      "AMM should have correct amout of residual wTokens",
    )
    assert.equal(
      await bToken.balanceOf.call(deployedAmm.address),
      0,
      "No residual bTokens should be in the AMM",
    )
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10062, // ~7243 + 3000 * (1 - 0.06) (btw, 10062 > 10000 - LPs are making money!!!)
      "Total assets value in the AMM should be correct",
    )

    // Now that the total pool value is 10062...
    // If another user deposits another 1k collateral, it should increase pool value
    // by ~9.9% and mint correct amount of LP tokens
    await collateralToken.mint(bobAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: bobAccount,
    })

    // Provide capital
    ret = await deployedAmm.provideCapital(1000, 0, { from: bobAccount })

    expectEvent(ret, "LpTokensMinted", {
      minter: bobAccount,
      collateralAdded: "1000",
      lpTokensMinted: "993",
    })

    assert.equal(
      await lpToken.balanceOf.call(bobAccount),
      993,
      "lp tokens should have been minted",
    )

    // Check getTokensSaleValue calculation
    // this value comes from:
    //
    // 7243 + 1000 = 8000 collateral in AMM
    // 993 lpTokens owned by bobAccount
    // 10993 total supply of lpTokens
    // (8000 * 993) / 10993 ~= 744
    // 997 collateral would be removed by the .withdrawCapital below
    // 997 - 744 = 253
    const tokensSaleValue = await deployedAmm.getTokensSaleValue(993)
    assert.equal(
      tokensSaleValue,
      253,
      "tokensSaleValue should be calculated correctly",
    )

    // Now let's withdraw all Bobs tokens to make sure Bob doesn't make money by simply
    // depositing and withdrawing collateral
    ret = await deployedAmm.withdrawCapital(993, true, 997, {
      from: bobAccount,
    })

    // Check the math
    expectEvent(ret, "LpTokensBurned", {
      redeemer: bobAccount,
      collateralRemoved: "997",
      paymentRemoved: "0",
      lpTokensBurned: "993",
    })
    assert.equal(
      await collateralToken.balanceOf.call(bobAccount),
      997, // 997 < 1000 - Bob lost some money, this is good!
      "Bob should lose some money on subsequent withdrawal",
    )
    assert.equal(
      await wToken.balanceOf.call(bobAccount),
      0,
      "No wTokens should be sent during partial withdrawal",
    )

    // Now let's withdraw all collateral
    // notice how the first/longest LP ends up with 7246 collateral + 3000 wTokens
    // on 10000 initial investment - not bad if those wTokens expire unexercised
    ret = await deployedAmm.withdrawCapital(10000, false, 0, {
      from: ownerAccount,
    })

    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "7246",
      paymentRemoved: "0",
      lpTokensBurned: "10000",
    })
    assert.equal(
      await wToken.balanceOf.call(ownerAccount),
      3000,
      "Residual wTokens should be sent during full withdrawal",
    )

    // Make sure no tokens is left in the AMM
    assert.equal(
      await collateralToken.balanceOf.call(deployedAmm.address),
      0,
      "No collateral token should be left in the AMM",
    )
    assert.equal(
      await wToken.balanceOf.call(deployedAmm.address),
      0,
      "No wToken should be left in the AMM",
    )
    assert.equal(
      await bToken.balanceOf.call(deployedAmm.address),
      0,
      "No bToken should be left in the AMM",
    )
  })

  it("Buys and sells bTokens", async () => {
    // Providing capital before approving should fail
    await expectRevert.unspecified(deployedAmm.provideCapital(10000, 0))

    // Approve collateral
    await collateralToken.mint(ownerAccount, 10000e8)
    await collateralToken.approve(deployedAmm.address, 10000e8)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000e8, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "1000000000000",
      lpTokensMinted: "1000000000000",
    })

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10000e8,
      "Total assets value in the AMM should be 10000e8",
    )

    // Check that AMM calculates correct bToken price
    assert.equal(
      await deployedAmm.getPriceForMarket.call(deployedMarket.address),
      "60069333333333333", // 0.06 * 1e18
      "AMM should calculate bToken price correctly",
    )

    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken.call())

    // Approve collateral
    await collateralToken.mint(aliceAccount, 10e8)
    await collateralToken.approve(deployedAmm.address, 10e8, {
      from: aliceAccount,
    })

    // Verify it fails if the amount of collateral maximum is exceeded
    await expectRevert(
      deployedAmm.bTokenBuy(marketAddress, 10e8, 5e7, { from: aliceAccount }),
      ERROR_MESSAGES.B_TOKEN_BUY_SLIPPAGE,
    )

    // Buys success
    ret = await deployedAmm.bTokenBuy(marketAddress, 10e8, 7e7, {
      from: aliceAccount,
    })

    // Formula: 1/2 * (sqrt((Rr + Rc - Δr)^2 + 4 * Δr * Rc) + Δr - Rr - Rc) - fee
    expectEvent(ret, "BTokensBought", {
      buyer: aliceAccount,
      bTokensBought: "1000000000",
      collateralPaid: "60122446", // is more than 60069333 (price without slippage)
    })

    // Now lets have alice sell roughly half the bTokens back... since she just pushed the bToken
    // price up with the last purchase it should be a better deal to get a smaller amount out.
    const wTokenAmmBalance = await wToken.balanceOf.call(deployedAmm.address)
    const bTokenAmmBalance = await bToken.balanceOf.call(deployedAmm.address)
    assert.equal(
      bTokenAmmBalance,
      0, // no residual bToken balance
      `AMM should have no residual bToken`,
    )
    assert.equal(
      wTokenAmmBalance,
      10e8, // same as bTokens bought
      `Invalid wTokenAmmBalance ${wTokenAmmBalance.toString()}`,
    )

    const bTokensToSell = "500000000" // sell half

    // Approve bTokens to trade for collateral
    await bToken.approve(deployedAmm.address, bTokensToSell, {
      from: aliceAccount,
    })

    // Verify it fails if the amount of collateral minimum is not met
    await expectRevert(
      deployedAmm.bTokenSell(marketAddress, bTokensToSell, 5e7, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.B_TOKEN_SELL_SLIPPAGE,
    )

    // Sell success
    ret = await deployedAmm.bTokenSell(marketAddress, bTokensToSell, 3e7, {
      from: aliceAccount,
    })

    expectEvent(ret, "BTokensSold", {
      seller: aliceAccount,
      bTokensSold: bTokensToSell,
      collateralPaid: "30021392", // worse than no-slippage price of 30034666.67
    })
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      969898946, // returned original collateral minus slippage
      "Trader should have correct collateralToken balance after the trade",
    )
    assert.equal(
      await bToken.balanceOf.call(aliceAccount),
      500000000,
      "Trader should have half of bTokens bTokens left",
    )

    // Sell the rest
    await bToken.approve(deployedAmm.address, bTokensToSell, {
      from: aliceAccount,
    })
    ret = await deployedAmm.bTokenSell(marketAddress, bTokensToSell, 3e7, {
      from: aliceAccount,
    })

    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      999920345, // returned original collateral minus slippage
      "Trader should have almost all of their collateralToken back",
    )
    assert.equal(
      await bToken.balanceOf.call(aliceAccount),
      0, // returned original collateral minus slippage
      "Trader should have no bTokens left",
    )
  })

  it("Withdraws large share of LP tokens", async () => {
    // Approve collateral
    await collateralToken.mint(ownerAccount, 1000e8)
    await collateralToken.approve(deployedAmm.address, 1000e8)

    // Provide capital
    let ret = await deployedAmm.provideCapital(1000e8, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "100000000000",
      lpTokensMinted: "100000000000",
    })

    // Do large trading to produce residual wTokens
    await collateralToken.mint(aliceAccount, 500e8)
    await collateralToken.approve(deployedAmm.address, 500e8, {
      from: aliceAccount,
    })

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(marketAddress, 500e8, 500e8, {
      from: aliceAccount,
    })
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    assert.equal(
      await wToken.balanceOf.call(deployedAmm.address),
      500e8,
      "AMM should have residual wTokens",
    )

    // Check pool value before withdrawal
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      "102185586987", // 1021e8 per 1000e8 LP tokens - looks right
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
      collateralRemoved: "55133864600", // 0.55 collateral/token
      paymentRemoved: "0",
      lpTokensBurned: "99900000000",
    })

    // Check wToken balance withdrawn
    assert.equal(
      await wToken.balanceOf.call(ownerAccount),
      "49950000000", // 499e8
      "Owner should have correct wToken balance",
    )

    // Check pool value after withdrawal
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      "102185587", // 1.02 per 1 LP tokens - looks right
      "Total assets value in the AMM should be correct",
    )
  })

  it("Sells more bTokens than wTokens in the pool", async () => {
    // Approve collateral
    await collateralToken.mint(ownerAccount, 1000e8)
    await collateralToken.approve(deployedAmm.address, 1000e8)

    // Provide capital
    let ret = await deployedAmm.provideCapital(1000e8, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "100000000000",
      lpTokensMinted: "100000000000",
    })

    // Do large trading to produce residual wTokens
    await collateralToken.mint(aliceAccount, 5189053654)
    await collateralToken.approve(deployedAmm.address, 5189053654, {
      from: aliceAccount,
    })

    // Buy bTokens (51e8 collateral cost)
    ret = await deployedAmm.bTokenBuy(marketAddress, 500e8, 5189053654, {
      from: aliceAccount,
    })

    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    assert.equal(
      await wToken.balanceOf.call(deployedAmm.address),
      500e8,
      "AMM should have residual wTokens",
    )

    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      0,
      "Trader should have correct collateral balance",
    )

    // Now withdraw most of it with auto sale disabled
    ret = await deployedAmm.withdrawCapital(999e8, false, 0)
    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "55133864600",
      paymentRemoved: "0",
      lpTokensBurned: "99900000000",
    })

    // Check wToken balance withdrawn
    assert.equal(
      await wToken.balanceOf.call(ownerAccount),
      "49950000000", // 499e8
      "Owner should have correct wToken balance",
    )

    // Check wToken balance left in the pool
    assert.equal(
      await wToken.balanceOf.call(deployedAmm.address),
      "50000000", // 0.5e8
      "AMM should have correct wToken balance",
    )

    // Sell all bTokens back to the AMM
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    await bToken.approve(deployedAmm.address, 500e8, {
      from: aliceAccount,
    })
    // First sell almost all bTokens
    ret = await deployedAmm.bTokenSell(marketAddress, 499e8, 0, {
      from: aliceAccount,
    })
    // Then sell the rest
    ret = await deployedAmm.bTokenSell(marketAddress, 1e8, 0, {
      from: aliceAccount,
    })
    assert.equal(
      await bToken.balanceOf.call(deployedAmm.address),
      "49950000000", // 499e8
      "AMM should have residual bTokens",
    )
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      "9213014", // lost 51e8 on slippage
      "Trader should have correct collateral balance",
    )
  })

  it("Enforces minimum trade size", async () => {
    // Verify it fails if min trade size is not met
    const minTradeSize = 1000
    await expectRevert(
      deployedAmm.bTokenBuy(marketAddress, minTradeSize - 1, 1, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.MIN_TRADE_SIZE,
    )
    await expectRevert(
      deployedAmm.bTokenSell(marketAddress, minTradeSize - 1, 1, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.MIN_TRADE_SIZE,
    )
  })

  it("Works in initial state", async () => {
    assert.equal(
      (await deployedAmm.getMarkets()).length,
      1,
      "Number of markets should be 1",
    )

    assert.equal(
      await deployedAmm.getTotalPoolValue(true),
      0,
      "Initial pool value should be 0",
    )

    const {
      0: unclaimedCollateral,
      1: unclaimedPayment,
    } = await deployedAmm.getUnclaimedBalances()
    assert.equal(
      unclaimedCollateral,
      0,
      "Initial unclaimedCollateral should be 0",
    )
    assert.equal(unclaimedPayment, 0, "Initial unclaimedPayment should be 0")

    assert.equal(
      await deployedAmm.getTokensSaleValue(0),
      0,
      "Initial token sale value should be 0",
    )

    assert.equal(
      await deployedAmm.getTokensSaleValue(100),
      0,
      "Initial token sale value should be 0",
    )
  })
})
