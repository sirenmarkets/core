const {
  expectRevert,
  time,
  expectEvent,
  BN,
} = require("@openzeppelin/test-helpers")
const Market = artifacts.require("Market")
const Proxy = artifacts.require("Proxy")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MockPriceOracle = artifacts.require("MockPriceOracle")
const { MarketStyle, getPriceRatio, checkBalances } = require("../util")

const ONE_DAY = 86400
const THIRTY_DAYS = 30 * ONE_DAY
const THIRTY_TWO_DAYS = 32 * ONE_DAY
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

const STATE_OPEN = 0
const STATE_EXPIRED = 1

contract("Minter AMM Remove expired markets", (accounts) => {
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

  beforeEach(async () => {
    // We create payment and collateral tokens before each test
    // in order to prevent balances from one test leaking into another
    // Create a collateral token
    collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    const proxyContract = await Proxy.new(marketsRegistryLogic.address)
    deployedMarketsRegistry = await MarketsRegistry.at(proxyContract.address)
    deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    deployedMockPriceOracle = await MockPriceOracle.new(
      await collateralToken.decimals.call(),
    )
    await deployedMockPriceOracle.setLatestAnswer(BTC_ORACLE_PRICE)

    const ammProxy = await Proxy.new(ammLogic.address)
    deployedAmm = await MinterAmm.at(ammProxy.address)

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
  })

  it("Add markets to amm", async () => {
    //set the expiration
    const NAME_1 = "WBTC.USDC.20300101.5000"
    const expiration = Number(await time.latest()) + THIRTY_DAYS // 30 days from now;
    const STRIKE_RATIO_1 = 5000

    // Non-owner shouldn't be able to create a market
    await expectRevert.unspecified(
      deployedMarketsRegistry.createMarket(
        NAME_1,
        collateralToken.address,
        paymentToken.address,
        MarketStyle.EUROPEAN_STYLE,
        STRIKE_RATIO_1,
        expiration,
        0,
        0,
        0,
        deployedAmm.address,
        { from: bobAccount },
      ),
    )

    // Add market to the amm
    await deployedMarketsRegistry.createMarket(
      NAME_1,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO_1,
      expiration,
      0,
      0,
      0,
      deployedAmm.address,
    )
    const marketAddress1 = await deployedMarketsRegistry.markets.call(NAME_1)
    let markets = await deployedAmm.getMarkets()
    is_markets_added = markets.includes(marketAddress1)
    assert.equal(is_markets_added, true, "Markets are not added to MinterAmm")

    // Non-registry shouldn't be able to add a market to the AMM
    await expectRevert(
      deployedAmm.addMarket(marketAddress1),
      "Only registry can call addMarket",
    )
    await expectRevert(
      deployedAmm.addMarket(marketAddress1, { from: bobAccount }),
      "Only registry can call addMarket",
    )
  })

  it("All markets expired", async () => {
    // set the expiration
    const expiration = Number(await time.latest()) + THIRTY_DAYS // 30 days from now;

    const STRIKE_RATIO_1 = 5000
    const NAME_1 = "WBTC.USDC.20300101.5000"
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    await deployedMarketsRegistry.createMarket(
      NAME_1,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO_1,
      expiration,
      0,
      0,
      0,
      deployedAmm.address,
    )
    const marketAddress1 = await deployedMarketsRegistry.markets.call(NAME_1)

    const STRIKE_RATIO_2 = 6000
    const NAME_2 = "WBTC.USDC.20300101.6000"
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    await deployedMarketsRegistry.createMarket(
      NAME_2,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO_2,
      expiration,
      0,
      0,
      0,
      deployedAmm.address,
    )
    const marketAddress2 = await deployedMarketsRegistry.markets.call(NAME_2)

    let markets = await deployedAmm.getMarkets()
    is_markets_added =
      markets.includes(marketAddress1) && markets.includes(marketAddress2)
    assert.equal(is_markets_added, true, "Markets are not added to MinterAmm")

    //Move the block time to get the markets expired
    const oneDay = 60 * 60 * 24
    await time.increase(oneDay * 30 + 1)

    await deployedAmm.claimAllExpiredTokens()

    markets = await deployedAmm.getMarkets()
    is_markets_removed = !(
      markets.includes(marketAddress1) && markets.includes(marketAddress2)
    )
    assert.equal(
      is_markets_removed,
      true,
      "Expired markets were not removed from MinterAmm",
    )
    assert.equal(0, markets.length, "The state of openmarkets is not correct")
  })

  it("3 open markets 2 expired markets", async () => {
    //3 markets will have expiry of 32 days and 2 markets will have expiry of 30 days

    //set the expiration
    const expiration_short = Number(await time.latest()) + THIRTY_DAYS // 30 days from now;
    const expiration = Number(await time.latest()) + THIRTY_TWO_DAYS // 32 days from now;

    const STRIKE_RATIO_1 = 50000
    const NAME_1 = "WBTC.USDC.20300101.50000"
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    await deployedMarketsRegistry.createMarket(
      NAME_1,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO_1,
      expiration,
      0,
      0,
      0,
      deployedAmm.address,
    )
    const marketAddress1 = await deployedMarketsRegistry.markets.call(NAME_1)

    const STRIKE_RATIO_2 = 60000
    const NAME_2 = "WBTC.USDC.20300101.60000"
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    await deployedMarketsRegistry.createMarket(
      NAME_2,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO_2,
      expiration,
      0,
      0,
      0,
      deployedAmm.address,
    )
    const marketAddress2 = await deployedMarketsRegistry.markets.call(NAME_2)

    const STRIKE_RATIO_3 = 70000
    const NAME_3 = "WBTC.USDC.20300101.70000"
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    await deployedMarketsRegistry.createMarket(
      NAME_3,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO_3,
      expiration_short,
      0,
      0,
      0,
      deployedAmm.address,
    )
    const marketAddress3 = await deployedMarketsRegistry.markets.call(NAME_3)

    const STRIKE_RATIO_4 = 80000
    const NAME_4 = "WBTC.USDC.20300101.80000"
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    await deployedMarketsRegistry.createMarket(
      NAME_4,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO_4,
      expiration,
      0,
      0,
      0,
      deployedAmm.address,
    )
    const marketAddress4 = await deployedMarketsRegistry.markets.call(NAME_4)

    const STRIKE_RATIO_5 = 90000
    const NAME_5 = "WBTC.USDC.20300101.90000"
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    await deployedMarketsRegistry.createMarket(
      NAME_5,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO_5,
      expiration_short,
      0,
      0,
      0,
      deployedAmm.address,
    )
    const marketAddress5 = await deployedMarketsRegistry.markets.call(NAME_5)

    let markets = await deployedAmm.getMarkets()
    is_markets_added =
      markets.includes(marketAddress1) &&
      markets.includes(marketAddress2) &&
      markets.includes(marketAddress3) &&
      markets.includes(marketAddress4) &&
      markets.includes(marketAddress5)
    assert.equal(is_markets_added, true, "Markets are not added to MinterAmm")

    //Move the block time to get the market3 and market5 expired
    const oneDay = 60 * 60 * 24
    await time.increase(oneDay * 30 + 1)

    await deployedAmm.claimAllExpiredTokens()

    markets = await deployedAmm.getMarkets()
    is_open_markets_not_removed =
      markets.includes(marketAddress1) &&
      markets.includes(marketAddress2) &&
      markets.includes(marketAddress4)
    assert.equal(
      is_open_markets_not_removed,
      true,
      "Open markets were removed from minterAmm",
    )

    is_expired_markets_removed = !(
      markets.includes(marketAddress3) && markets.includes(marketAddress5)
    )
    assert.equal(
      is_expired_markets_removed,
      true,
      "Expired markets were not removed from MinterAmm",
    )

    assert.equal(
      true,
      markets.length == 3 &&
        marketAddress1 == markets[0] &&
        marketAddress2 == markets[1] &&
        marketAddress4 == markets[2],
      "The state of openmarkets is not correct",
    )
  })
  // This is the edge case where i>openMarkets.length
  it("1 open & 1 market expired(last one added to the open markets)", async () => {
    //set the expiration
    const expiration_short = Number(await time.latest()) + THIRTY_DAYS // 30 days from now;
    const expiration = Number(await time.latest()) + THIRTY_TWO_DAYS // 32 days from now;

    const STRIKE_RATIO_1 = 5000
    const NAME_1 = "WBTC.USDC.20300101.5000"
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    await deployedMarketsRegistry.createMarket(
      NAME_1,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO_1,
      expiration,
      0,
      0,
      0,
      deployedAmm.address,
    )
    const marketAddress1 = await deployedMarketsRegistry.markets.call(NAME_1)

    const STRIKE_RATIO_2 = 6000
    const NAME_2 = "WBTC.USDC.20300101.6000"
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    await deployedMarketsRegistry.createMarket(
      NAME_2,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO_2,
      expiration_short,
      0,
      0,
      0,
      deployedAmm.address,
    )
    const marketAddress2 = await deployedMarketsRegistry.markets.call(NAME_2)

    let markets = await deployedAmm.getMarkets()
    is_markets_added =
      markets.includes(marketAddress1) && markets.includes(marketAddress2)
    assert.equal(is_markets_added, true, "Markets are not added to MinterAmm")

    //Move the block time to get the second market expired
    const oneDay = 60 * 60 * 24
    await time.increase(oneDay * 30 + 1)

    await deployedAmm.claimAllExpiredTokens()

    markets = await deployedAmm.getMarkets()
    is_open_markets_not_removed = markets.includes(marketAddress1)
    assert.equal(
      is_open_markets_not_removed,
      true,
      "Open markets were removed from minterAmm",
    )
    is_expired_markets_removed = !markets.includes(marketAddress2)
    assert.equal(
      is_markets_removed,
      true,
      "Expired markets were not removed from MinterAmm",
    )

    assert.equal(
      true,
      markets.length == 1 && marketAddress1 == markets[0],
      "The state of openmarkets is not correct",
    )
  })
})
