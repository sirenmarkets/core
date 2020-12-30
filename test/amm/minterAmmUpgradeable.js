/* global artifacts contract it assert */
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers")
const Market = artifacts.require("Market")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MockPriceOracle = artifacts.require("MockPriceOracle")
const Proxy = artifacts.require("Proxy")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")
const TestUpgradeableAmm = artifacts.require("TestUpgradeableAmm")

const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC
const SHOULD_INVERT_ORACLE_PRICE = false

/**
 * Testing the flows upgrading the AMM
 */
contract("AMM Upgradeability", (accounts) => {
  let marketLogic
  let tokenLogic
  let ammLogic
  let otherAmmLogic
  let lpTokenLogic
  let marketsRegistryLogic

  let deployedMarketsRegistry
  let deployedMockPriceOracle
  let deployedAmm

  let collateralToken
  let paymentToken

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    marketLogic = await Market.deployed()
    tokenLogic = await SimpleToken.deployed()
    ammLogic = await MinterAmm.deployed()
    otherAmmLogic = await TestUpgradeableAmm.new()
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

    deployedMockPriceOracle = await MockPriceOracle.new(
      await collateralToken.decimals.call(),
    )
    await deployedMockPriceOracle.setLatestAnswer(BTC_ORACLE_PRICE)
  })

  it("Fail to upgrade prior to initialization", async () => {
    await expectRevert(
      deployedAmm.updateAmmImplementation(otherAmmLogic.address),
      "Ownable: caller is not the owner",
    )
  })

  it("Fail to upgrade from non-owner account", async () => {
    await expectRevert(
      deployedAmm.updateAmmImplementation(otherAmmLogic.address, {
        from: accounts[1],
      }),
      "Ownable: caller is not the owner",
    )
  })

  it("should upgrade and be able to call function on upgraded contract", async () => {
    let ret = await deployedAmm.initialize(
      deployedMarketsRegistry.address,
      deployedMockPriceOracle.address,
      paymentToken.address,
      collateralToken.address,
      lpTokenLogic.address,
      0,
      SHOULD_INVERT_ORACLE_PRICE,
    )

    ret = await deployedAmm.updateAmmImplementation(otherAmmLogic.address)

    expectEvent.inLogs(ret.logs, "CodeAddressUpdated", {
      newAddress: otherAmmLogic.address,
    })

    const upgradedAmm = await TestUpgradeableAmm.at(deployedAmm.address)

    // after upgrade we should call new method
    assert.equal(await upgradedAmm.isUpgraded(), true)
  })
})
