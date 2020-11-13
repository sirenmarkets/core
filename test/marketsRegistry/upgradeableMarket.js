/* global artifacts contract it assert */
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers")
const Market = artifacts.require("Market")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const Proxy = artifacts.require("Proxy")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")
const TestUpgradeableMarket = artifacts.require("TestUpgradeableMarket")

const { MarketStyle } = require("../util")
const TestHelpers = require("../testHelpers")

const NAME = "WBTC.USDC.20300101.50000"

const STRIKE_RATIO = 50000
const EXPIRATION = 1893456000

/**
 * Testing the flows upgrading the AMM
 */
contract("Market Upgradeability", (accounts) => {
  let marketLogic
  let tokenLogic
  let ammLogic
  let marketsRegistryLogic

  let deployedMarketsRegistry
  let deployedMarket

  let collateralToken
  let paymentToken

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    marketLogic = await Market.deployed()
    tokenLogic = await SimpleToken.deployed()
    ammLogic = await MinterAmm.deployed()
    otherMarketLogic = await TestUpgradeableMarket.new()
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

    await deployedMarketsRegistry.createMarket(
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

    const deployedMarketAddress = await deployedMarketsRegistry.markets.call(
      NAME,
    )
    deployedMarket = await Market.at(deployedMarketAddress)
  })

  it("Fail to upgrade from non-owner account", async () => {
    await expectRevert(
      deployedMarketsRegistry.updateImplementationForMarket(
        deployedMarket.address,
        otherMarketLogic.address,
        { from: accounts[1] },
      ),
      "Ownable: caller is not the owner",
    )
  })

  it("should upgrade and be able to call function on upgraded contract", async () => {
    const ret = await deployedMarketsRegistry.updateImplementationForMarket(
      deployedMarket.address,
      otherMarketLogic.address,
    )

    await expectEvent.inTransaction(
      ret.tx,
      deployedMarket,
      "CodeAddressUpdated",
      {
        newAddress: otherMarketLogic.address,
      },
    )

    const upgradedMarket = await TestUpgradeableMarket.at(
      deployedMarket.address,
    )

    // after upgrade we should call new method
    assert.equal(await upgradedMarket.isUpgraded(), true)
  })
})
