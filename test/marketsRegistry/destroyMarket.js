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
const SimpleToken = artifacts.require("SimpleToken")
const Proxy = artifacts.require("Proxy")
const MinterAmm = artifacts.require("MinterAmm")

const TestHelpers = require("../testHelpers")

const NAME = "WBTC.USDC.20300101.50000"

const STRIKE_RATIO = 50000

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

  let collateralToken
  let paymentToken

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    tokenLogic = await SimpleToken.deployed()
    marketLogic = await Market.deployed()
    marketsRegistryLogic = await MarketsRegistry.deployed()
    ammLogic = await MinterAmm.deployed()

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
      ammLogic.address,
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

  /**
   * Ensure the market is removed from the MarketsRegistry's markets mapping
   * @param {*} marketName - markets that was removed
   * @param {*} deployedMarketsRegistry - instantiated contract instance
   */
  const assertRemovedFromMarketsMapping = async (
    marketName,
    deployedMarketsRegistry,
  ) => {
    const deployedMarketAddress = await deployedMarketsRegistry.markets.call(
      marketName,
    )
    assert.equal(deployedMarketAddress, TestHelpers.ADDRESS_ZERO)
  }

  it("Removes markets from marketsByAssets list", async () => {
    let ret = await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    const TOTAL_MARKETS = 25

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24
    const oneHundredEightDays = (twoDays / 2) * 180

    // Create 25 markets
    let createdMarkets = []
    let marketNames = []
    for (let i = 0; i < TOTAL_MARKETS; i++) {
      // Set the expiration to 2 days from now plus a buffer to make expirations unique
      const expiration = parseInt(currentTime) + twoDays + i

      const marketName = `WBTC.USDC.20300101${i}.50000`

      ret = await deployedMarketsRegistry.createMarket(
        marketName,
        collateralToken.address,
        paymentToken.address,
        MarketStyle.EUROPEAN_STYLE,
        STRIKE_RATIO,
        expiration,
        0,
        0,
        0,
        ammLogic.address,
      )

      // Add the market address to our list
      createdMarkets.push(ret.receipt.logs[1].args.newAddress)
      marketNames.push(marketName)

      // Verify the market was corretly populated in the MarketsRegistry.markets mapping
      const found = await deployedMarketsRegistry.markets.call(marketName)
      assert.notEqual(found, TestHelpers.ADDRESS_ZERO)
    }

    const calculatedPair = web3.utils.keccak256(
      web3.eth.abi.encodeParameters(
        ["address", "address"],
        [collateralToken.address, paymentToken.address],
      ),
    )

    // Move the block time into the future so the contract is expired
    await time.increase(twoDays + TOTAL_MARKETS + 1)
    // Move 180 days so it is closed
    await time.increase(oneHundredEightDays)

    let marketsByAsset = await deployedMarketsRegistry.getMarketsByAssetPair.call(
      calculatedPair,
    )

    // Verify we are starting with matching lists
    TestHelpers.assertNonzeroAddressesMatch(createdMarkets, marketsByAsset)

    // Destroy the first one in the list
    ret = await deployedMarketsRegistry.selfDestructMarket(
      createdMarkets[0],
      ownerAccount,
    )
    // console.log(`Gas to remove hardest item: ${ret.receipt.gasUsed}`) // 276,708 gas

    // Verify it got removed from the mapping
    await assertRemovedFromMarketsMapping(
      marketNames[0],
      deployedMarketsRegistry,
    )

    // Now verify it got removed from the list
    marketsByAsset = await deployedMarketsRegistry.getMarketsByAssetPair.call(
      calculatedPair,
    )

    // trim the first one from our list and verify
    createdMarkets = createdMarkets.slice(1)
    marketNames = marketNames.slice(1)
    assert.equal(marketsByAsset.length, createdMarkets.length)
    assert.equal(marketsByAsset[0], createdMarkets[0])
    TestHelpers.assertNonzeroAddressesMatch(createdMarkets, marketsByAsset)

    // Now destroy one from the middle of the list
    await deployedMarketsRegistry.selfDestructMarket(
      createdMarkets[10],
      ownerAccount,
    )

    // Verify it got removed from the mapping
    await assertRemovedFromMarketsMapping(
      marketNames[10],
      deployedMarketsRegistry,
    )

    // Now verify it got removed from the list
    marketsByAsset = await deployedMarketsRegistry.getMarketsByAssetPair.call(
      calculatedPair,
    )

    // trim the first one from our list and verify
    createdMarkets.splice(10, 1)
    marketNames.splice(10, 1)
    assert.equal(marketsByAsset.length, createdMarkets.length)
    assert.equal(marketsByAsset[9], createdMarkets[9])
    assert.equal(marketsByAsset[10], createdMarkets[10])
    assert.equal(marketsByAsset[11], createdMarkets[11])
    TestHelpers.assertNonzeroAddressesMatch(createdMarkets, marketsByAsset)

    // Destroy the last one in the list
    await deployedMarketsRegistry.selfDestructMarket(
      createdMarkets[createdMarkets.length - 1],
      ownerAccount,
    )

    // Verify it got removed from the mapping
    await assertRemovedFromMarketsMapping(
      marketNames[createdMarkets.length - 1],
      deployedMarketsRegistry,
    )

    // Now verify it got removed from the list
    marketsByAsset = await deployedMarketsRegistry.getMarketsByAssetPair.call(
      calculatedPair,
    )

    createdMarkets.pop()
    marketNames.pop()
    assert.equal(marketsByAsset.length, createdMarkets.length)
    assert.equal(
      marketsByAsset[marketsByAsset.length - 1],
      createdMarkets[createdMarkets.length - 1],
    )
    TestHelpers.assertNonzeroAddressesMatch(createdMarkets, marketsByAsset)

    // Let's randomly remove the rest
    while (createdMarkets.length > 0) {
      const random = Math.floor(Math.random() * createdMarkets.length)

      // Destroy the market
      await deployedMarketsRegistry.selfDestructMarket(
        createdMarkets[random],
        ownerAccount,
      )

      await assertRemovedFromMarketsMapping(
        marketNames[random],
        deployedMarketsRegistry,
      )

      // Get the updated list
      marketsByAsset = await deployedMarketsRegistry.getMarketsByAssetPair.call(
        calculatedPair,
      )

      // Splice the local arary
      createdMarkets.splice(random, 1)
      marketNames.splice(random, 1)

      // Verify they still match
      TestHelpers.assertNonzeroAddressesMatch(createdMarkets, marketsByAsset)
    }
  })
})
