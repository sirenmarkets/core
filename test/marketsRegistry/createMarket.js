/* global artifacts contract it assert */
const {
  expectRevert,
  time,
  expectEvent,
  BN,
} = require("@openzeppelin/test-helpers")
const { MarketStyle } = require("../util")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MinterAmm = artifacts.require("MinterAmm")
const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")
const Proxy = artifacts.require("Proxy")
const TestHelpers = require("../testHelpers")

const NAME = "WBTC.USDC.20300101.50000"

const STRIKE_RATIO = 50000
const EXPIRATION = 1893456000

/**
 * Testing the flows for the Market Contract
 */
contract("Create Markets", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  let marketLogic
  let tokenLogic
  let marketsRegistryLogic
  let deployedMarketsRegistry

  let collateralToken
  let paymentToken

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    tokenLogic = await SimpleToken.deployed()
    marketLogic = await Market.deployed()
    marketsRegistryLogic = await MarketsRegistry.deployed()

    // Create a collateral token
    collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)
  })

  beforeEach(async () => {
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    const proxyContract = await Proxy.new(marketsRegistryLogic.address)
    deployedMarketsRegistry = await MarketsRegistry.at(proxyContract.address)
  })

  it("Creates", async () => {
    const ammLogic = await MinterAmm.new()
    let ret = await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    // Ensure non-owner can't create a market
    await expectRevert.unspecified(
      deployedMarketsRegistry.createMarket(
        NAME,
        collateralToken.address,
        paymentToken.address,
        MarketStyle.EUROPEAN_STYLE,
        STRIKE_RATIO,
        EXPIRATION,
        0,
        0,
        0,
        TestHelpers.ADDRESS_ZERO,
        { from: bobAccount },
      ),
    )

    // Create the market
    ret = await deployedMarketsRegistry.createMarket(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO,
      EXPIRATION,
      0,
      0,
      0,
      TestHelpers.ADDRESS_ZERO,
    )

    expectEvent.inLogs(ret.logs, "MarketCreated", { name: NAME })

    // Ensure a market can't be created again
    await expectRevert(
      deployedMarketsRegistry.createMarket(
        NAME,
        collateralToken.address,
        paymentToken.address,
        MarketStyle.EUROPEAN_STYLE,
        STRIKE_RATIO,
        EXPIRATION,
        0,
        0,
        0,
        TestHelpers.ADDRESS_ZERO,
      ),
      "Market name already registered",
    )

    // Verify the market exists
    const deployedMarketAddress = await deployedMarketsRegistry.markets.call(
      NAME,
    )
    const newMarket = await Market.at(deployedMarketAddress)
    assert.equal(
      await newMarket.marketName.call(),
      NAME,
      "New market should be deployed with name",
    )
  })
})
