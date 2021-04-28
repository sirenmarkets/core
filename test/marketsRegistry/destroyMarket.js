/* global artifacts contract it assert */
const {
  expectRevert,
  time,
  expectEvent,
  BN,
} = require("@openzeppelin/test-helpers")
const { MarketStyle } = require("../util")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const Market = artifacts.require("Market")
const MockPriceOracle = artifacts.require("MockPriceOracle")
const SimpleToken = artifacts.require("SimpleToken")
const Proxy = artifacts.require("Proxy")
const MinterAmm = artifacts.require("MinterAmm")

const TestHelpers = require("../testHelpers")

const NAME = "WBTC.USDC.20300101.50000"

const STRIKE_RATIO = 50000

const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC
const SHOULD_INVERT_ORACLE_PRICE = false

/**
 * Testing the flows for the Market Contract
 */
contract("Destroy Markets", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  let marketLogic
  let tokenLogic
  let marketsRegistryLogic
  let deployedMarketsRegistry
  let ammLogic
  let lpTokenLogic

  let collateralToken
  let paymentToken

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    tokenLogic = await SimpleToken.deployed()
    marketLogic = await Market.deployed()
    marketsRegistryLogic = await MarketsRegistry.deployed()
    ammLogic = await MinterAmm.deployed()
    lpTokenLogic = await SimpleToken.deployed()

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

  it("Destroys", async () => {
    let ret = await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24
    const oneHundredEightDays = (twoDays / 2) * 180

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    // Create the market
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
      TestHelpers.ADDRESS_ZERO,
    )

    // Get the market adress
    const deployedMarketAddress = await deployedMarketsRegistry.markets.call(
      NAME,
    )

    // Ensure it can't be destroyed while it is open
    await expectRevert.unspecified(
      deployedMarketsRegistry.selfDestructMarket(
        deployedMarketAddress,
        ownerAccount,
      ),
    )

    // Move the block time into the future so the contract is expired
    await time.increase(twoDays + 1)

    // Ensure it can't be destroyed while it is Expired
    await expectRevert.unspecified(
      deployedMarketsRegistry.selfDestructMarket(
        deployedMarketAddress,
        ownerAccount,
      ),
    )

    // Move 180 days so it is closed
    await time.increase(oneHundredEightDays)

    // Ensure non-owner can't destroy
    await expectRevert.unspecified(
      deployedMarketsRegistry.selfDestructMarket(
        deployedMarketAddress,
        ownerAccount,
        { from: bobAccount },
      ),
    )

    // Destroy it
    ret = await deployedMarketsRegistry.selfDestructMarket(
      deployedMarketAddress,
      ownerAccount,
    )

    // Verify the event
    expectEvent.inLogs(ret.logs, "MarketDestroyed", {
      market: deployedMarketAddress,
    })

    // Verify it is gone
    try {
      const deployedMarket = await Market.at(deployedMarketAddress)
      await deployedMarket.marketName.call()
      // Should not get here
      throw new Exception("Functions should fail to destroyed contract")
    } catch {}
  })

  it("Sweeps payment or collateral token", async () => {
    let ret = await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24
    const oneHundredEightDays = (twoDays / 2) * 180

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    let deployedMockPriceOracle = await MockPriceOracle.new(
      await collateralToken.decimals.call(),
    )
    await deployedMockPriceOracle.setLatestAnswer(BTC_ORACLE_PRICE)

    const ammProxy = await Proxy.new(ammLogic.address)
    deployedAmm = await MinterAmm.at(ammProxy.address)

    // Initialize the AMM
    await deployedAmm.initialize(
      deployedMarketsRegistry.address,
      deployedMockPriceOracle.address,
      paymentToken.address,
      collateralToken.address,
      lpTokenLogic.address,
      0,
      SHOULD_INVERT_ORACLE_PRICE,
    )

    // Create the market
    ret = await deployedMarketsRegistry.createMarket(
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

    // Get the market adress
    const deployedMarketAddress = await deployedMarketsRegistry.markets.call(
      NAME,
    )

    // Move the block time into the future so the contract is expired
    await time.increase(twoDays + 1)
    // Move 180 days so it is closed
    await time.increase(oneHundredEightDays)

    // Send some tokens in
    await collateralToken.mint(deployedMarketAddress, "100")
    await paymentToken.mint(deployedMarketAddress, "200")

    // Destroy it
    ret = await deployedMarketsRegistry.selfDestructMarket(
      deployedMarketAddress,
      ownerAccount,
    )

    assert.equal(
      await collateralToken.balanceOf.call(deployedMarketsRegistry.address),
      100,
      "Owner should have gotten collateral",
    )

    assert.equal(
      await collateralToken.balanceOf.call(deployedMarketsRegistry.address),
      100,
      "Owner should have gotten payment token",
    )
  })
})
