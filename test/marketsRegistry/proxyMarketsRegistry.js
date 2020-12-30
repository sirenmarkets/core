/* global artifacts contract it assert */
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MockPriceOracle = artifacts.require("MockPriceOracle")
const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")
const Proxy = artifacts.require("Proxy")
const TestUpgradeMarketsRegistry = artifacts.require(
  "TestUpgradeMarketsRegistry",
)
const { MarketStyle } = require("../util")
const MinterAmm = artifacts.require("MinterAmm")

/**
 * Testing the flows for the Market Contract
 */
contract("MarketsRegistry Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  let marketLogic
  let tokenLogic
  let marketsRegistryLogic
  let ammLogic
  let deployedMarketsRegistry

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    tokenLogic = await SimpleToken.deployed()
    marketLogic = await Market.deployed()
    marketsRegistryLogic = await MarketsRegistry.deployed()
    ammLogic = await MinterAmm.deployed()
  })

  beforeEach(async () => {
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    const proxyContract = await Proxy.new(marketsRegistryLogic.address)
    deployedMarketsRegistry = await MarketsRegistry.at(proxyContract.address)
  })

  it("Initializes", async () => {
    const ret = await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    assert.equal(
      await deployedMarketsRegistry.tokenImplementation.call(),
      tokenLogic.address,
      "Token Logic should be set correctly",
    )
    assert.equal(
      await deployedMarketsRegistry.marketImplementation.call(),
      marketLogic.address,
      "Market Logic should be set correctly",
    )
  })

  it("Allows owner to update MarketRegistry contract fields", async () => {
    let ret = await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    const newTokenImpl = await SimpleToken.deployed()
    const newMarketImpl = await Market.deployed()
    const newAmmImpl = await MinterAmm.deployed()

    // Verify a non-owner can't upgrade the impl addresses
    await expectRevert.unspecified(
      deployedMarketsRegistry.updateTokenImplementation(newTokenImpl.address, {
        from: bobAccount,
      }),
    )
    await expectRevert.unspecified(
      deployedMarketsRegistry.updateMarketImplementation(
        newMarketImpl.address,
        { from: bobAccount },
      ),
    )
    await expectRevert.unspecified(
      deployedMarketsRegistry.updateAmmImplementation(newAmmImpl.address, {
        from: bobAccount,
      }),
    )

    // Verify owner can upgrade and events are fired
    ret = await deployedMarketsRegistry.updateTokenImplementation(
      newTokenImpl.address,
    )
    expectEvent.inLogs(ret.logs, "TokenImplementationUpdated", {
      newAddress: newTokenImpl.address,
    })

    ret = await deployedMarketsRegistry.updateMarketImplementation(
      newMarketImpl.address,
    )
    expectEvent.inLogs(ret.logs, "MarketImplementationUpdated", {
      newAddress: newMarketImpl.address,
    })

    ret = await deployedMarketsRegistry.updateAmmImplementation(
      newAmmImpl.address,
    )
    expectEvent.inLogs(ret.logs, "AmmImplementationUpdated", {
      newAddress: newAmmImpl.address,
    })
  })

  it("Allows owner to update the market module itself", async () => {
    let ret = await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    const newImpl = await TestUpgradeMarketsRegistry.new()

    // Verify a non-owner can't upgrade the imple addresses
    await expectRevert.unspecified(
      deployedMarketsRegistry.updateMarketsRegistryImplementation(
        newImpl.address,
        { from: bobAccount },
      ),
    )

    // Verify owner can upgrade and event is fired
    ret = await deployedMarketsRegistry.updateMarketsRegistryImplementation(
      newImpl.address,
    )
    expectEvent.inLogs(ret.logs, "CodeAddressUpdated", {
      newAddress: newImpl.address,
    })

    // Verify the upgrade function can be called
    const upgradedMarketsRegistry = await TestUpgradeMarketsRegistry.at(
      deployedMarketsRegistry.address,
    )
    const isUpgraded = await upgradedMarketsRegistry.isUpgraded.call()
    assert.equal(isUpgraded, true, "New function should validate")
  })

  it("Allows token recovery", async () => {
    const ret = await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    // Create a new test token
    const token = await SimpleToken.new()
    await token.initialize("USD Coin", "USDC", 6)

    // Mint tokens to the owner
    await token.mint(ownerAccount, 1000)

    // Send 1000 tokens into the registry
    token.transfer(deployedMarketsRegistry.address, 1000)

    // Verify non-owner cannot sweep
    await expectRevert.unspecified(
      deployedMarketsRegistry.recoverTokens(token.address, bobAccount, {
        from: bobAccount,
      }),
    )

    // Verify owner can sweep
    await deployedMarketsRegistry.recoverTokens(token.address, bobAccount)
    assert.equal(
      await token.balanceOf.call(bobAccount),
      1000,
      "Bob should have tokens",
    )
  })

  it("Calculates assetPair correctly for markets and amm", async () => {
    let ret = await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    const NAME = "WBTC.USDC.20300101.50000"
    const STRIKE_RATIO = 50000
    const EXPIRATION = 1893456000
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // deploy the price oracle for the AMM
    const deployedMockPriceOracle = await MockPriceOracle.new(
      await collateralToken.decimals.call(),
    )
    await deployedMockPriceOracle.setLatestAnswer(14_000 * 10 ** 8)

    // create the AMM we'll use in the test
    ret = await deployedMarketsRegistry.createAmm(
      deployedMockPriceOracle.address,
      paymentToken.address,
      collateralToken.address,
      0,
      false,
    )

    // get the new AMM address from the AmmCreated event
    const ammAddress = ret.logs[2].args["0"]
    const deployedAmm = await MinterAmm.at(ammAddress)

    const calculatedPair = web3.utils.keccak256(
      web3.eth.abi.encodeParameters(
        ["address", "address"],
        [collateralToken.address, paymentToken.address],
      ),
    )

    // make sure we're calculating the assetPair correctly
    const pairFromAmm = await deployedAmm.assetPair.call()
    assert.equal(pairFromAmm, calculatedPair)

    // now check to see if we can lookup the amm by assetPair
    const ammAddressFromRegistry = await deployedMarketsRegistry.amms.call(
      calculatedPair,
    )
    assert.equal(ammAddressFromRegistry, ammAddress)

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
      deployedAmm.address,
    )

    // now see if we can look up the in the marketsByAssets array using the assetPair
    const marketsByAsset = await deployedMarketsRegistry.getMarketsByAssetPair.call(
      calculatedPair,
    )
    assert.equal(marketsByAsset.length, 1)

    const deployedMarketAddress = await deployedMarketsRegistry.markets.call(
      NAME,
    )
    deployedMarket = await Market.at(deployedMarketAddress)
    assert.equal(marketsByAsset[0], deployedMarket.address)
  })
})
