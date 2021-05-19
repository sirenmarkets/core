/* global artifacts contract it assert */
const {
  expectRevert,
  expectEvent,
  BN,
  time,
} = require("@openzeppelin/test-helpers")
const Market = artifacts.require("Market")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MockPriceOracle = artifacts.require("MockPriceOracle")
const Proxy = artifacts.require("Proxy")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")

const { MarketStyle, getPriceRatio } = require("../util")

const LP_TOKEN_NAME = "WBTC-USDC"
const NAME = "WBTC.USDC.20300101.15000"
const BTC_ORACLE_PRICE = 14_000 * 1e8 // BTC oracle answer has 8 decimals places, same as BTC
const SHOULD_INVERT_ORACLE_PRICE = true

/**
 * Testing the flows for the Market Contract
 */
contract("AMM Verification: Oracle", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const carolAccount = accounts[3]
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

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    marketLogic = await Market.deployed()
    tokenLogic = await SimpleToken.deployed()
    ammLogic = await MinterAmm.deployed()
    lpTokenLogic = await SimpleToken.deployed()
    marketsRegistryLogic = await MarketsRegistry.deployed()
  })

  beforeEach(async () => {})

  it("should calculate correctly when USDC is the collateral token", async () => {
    let strikeRatio
    let expiration
    await setupBeforeEach(false, function callback(
      strikeRatioValue,
      expirationValue,
    ) {
      strikeRatio = strikeRatioValue
      expiration = expirationValue
    })

    // Initialize the AMM
    let ret = await deployedAmm.initialize(
      deployedMarketsRegistry.address,
      deployedMockPriceOracle.address,
      paymentToken.address,
      collateralToken.address,
      lpTokenLogic.address,
      0,
      SHOULD_INVERT_ORACLE_PRICE,
    )

    await deployedMarketsRegistry.createMarket(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      strikeRatio,
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
    const marketAddress = openMarkets[0]

    // Approve collateral
    await collateralToken.mint(ownerAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000)

    // Provide capital
    ret = await deployedAmm.provideCapital(10000, 0)

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

    // Check current collateral price
    assert.equal(
      await deployedAmm.getCurrentCollateralPrice.call(),
      "7142857142857142", // 1 / 0.00007142857 = 14000
      "Collateral price should be correct",
    )

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getPriceForMarket.call(deployedMarket.address),
      "135623809523809502", // 0.13 USD / contract
      "AMM should have correct price for market",
    )

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    // Now let's do some trading and see how price behaves
    await collateralToken.mint(aliceAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(marketAddress, 3000, 3000, {
      from: aliceAccount,
    })
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      483, // paid 517 for 3000 tokens at ~0.17
      "Trader should pay correct collateral amount",
    )

    // Check total assets value again.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10110,
      "Total assets value in the AMM should be above 10k",
    )

    // Sell bTokens
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    await bToken.approve(deployedAmm.address, 3000, {
      from: aliceAccount,
    })
    ret = await deployedAmm.bTokenSell(marketAddress, 3000, 0, {
      from: aliceAccount,
    })
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      794, // received 311 for 3000 tokens at ~0.1
      "Trader should receive correct collateral amount",
    )

    // Check total assets value again.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10206,
      "Total assets value in the AMM should be above 10k",
    )
  })

  it("should calculate correctly when WBTC is the collateral token", async () => {
    let strikeRatio
    let expiration
    await setupBeforeEach(true, function callback(
      strikeRatioValue,
      expirationValue,
    ) {
      strikeRatio = strikeRatioValue
      expiration = expirationValue
    })

    // Initialize the AMM
    let ret = await deployedAmm.initialize(
      deployedMarketsRegistry.address,
      deployedMockPriceOracle.address,
      paymentToken.address,
      collateralToken.address,
      lpTokenLogic.address,
      0,
      false,
    )

    await deployedMarketsRegistry.createMarket(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      strikeRatio,
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
    const marketAddress = openMarkets[0]

    // Approve collateral
    await collateralToken.mint(ownerAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000)

    // Provide capital
    ret = await deployedAmm.provideCapital(10000, 0)

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

    // Check current collateral price
    assert.equal(
      await deployedAmm.getCurrentCollateralPrice.call(),
      "140000000000000000000", // 14000
      "Collateral price should be correct",
    )

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getPriceForMarket.call(deployedMarket.address),
      "60069333333333333", // 0.06 BTC / contract
      "AMM should have correct price for market",
    )

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    // Now let's do some trading and see how price behaves
    await collateralToken.mint(aliceAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(marketAddress, 3000, 3000, {
      from: aliceAccount,
    })
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      757, // paid 243 for 3000 tokens at ~0.08
      "Trader should pay correct collateral amount",
    )

    // Check total assets value again.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10062,
      "Total assets value in the AMM should be above 10k",
    )

    // Sell bTokens
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    await bToken.approve(deployedAmm.address, 3000, {
      from: aliceAccount,
    })
    ret = await deployedAmm.bTokenSell(marketAddress, 3000, 0, {
      from: aliceAccount,
    })
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      888, // received 131 for 3000 tokens at ~0.04
      "Trader should receive correct collateral amount",
    )

    // Check total assets value again.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10112,
      "Total assets value in the AMM should be above 10k",
    )
  })

  const setupBeforeEach = async (wbtcIsCollateralToken, callback) => {
    // We create payment and collateral tokens before each test
    // in order to prevent balances from one test leaking into another
    collateralToken = await SimpleToken.new()
    paymentToken = await SimpleToken.new()

    if (wbtcIsCollateralToken) {
      // Create a collateral token
      await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

      // Create a payment token
      await paymentToken.initialize("USD Coin", "USDC", 6)
    } else {
      // Create a collateral token
      await paymentToken.initialize("Wrapped BTC", "WBTC", 8)

      // Create a payment token
      await collateralToken.initialize("USD Coin", "USDC", 6)
    }

    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    const proxyContract = await Proxy.new(marketsRegistryLogic.address)
    deployedMarketsRegistry = await MarketsRegistry.at(proxyContract.address)
    deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    const ammProxy = await Proxy.new(ammLogic.address)
    deployedAmm = await MinterAmm.at(ammProxy.address)

    deployedMockPriceOracle = await MockPriceOracle.new(8)
    await deployedMockPriceOracle.setLatestAnswer(BTC_ORACLE_PRICE)

    const strikeRatio = getPriceRatio(
      15000, // 15000 USD per BTC
      await collateralToken.decimals.call(),
      await paymentToken.decimals.call(),
      !wbtcIsCollateralToken,
    )

    const expiration = Number(await time.latest()) + 30 * 86400 // 30 days from now;

    callback(strikeRatio, expiration)
  }
})
