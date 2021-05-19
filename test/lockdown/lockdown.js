const { expectRevert, time } = require("@openzeppelin/test-helpers")
const Market = artifacts.require("Market")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MockPriceOracle = artifacts.require("MockPriceOracle")
const Proxy = artifacts.require("Proxy")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")
const Lockdown = artifacts.require("Lockdown")

const { MarketStyle, getPriceRatio } = require("../util")

const NAME = "WBTC.USDC.20300101.15000"
const STRIKE_RATIO = getPriceRatio(15000, 8, 6) // 15000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC
const SHOULD_INVERT_ORACLE_PRICE = false
const STATE_OPEN = 0

/**
 * Testing the flows for the Market Contract
 */
contract("Lockdown", (accounts) => {
  const ownerAccount = accounts[0]

  let marketLogic
  let tokenLogic
  let ammLogic
  let lpTokenLogic
  let marketsRegistryLogic

  let deployedMarketsRegistry
  let deployedMockPriceOracle
  let deployedMarket
  let deployedAmm
  let deployedLockdown

  let collateralToken
  let paymentToken

  let expiration

  let marketAddress

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    marketLogic = await Market.new()
    tokenLogic = await SimpleToken.new()
    lpTokenLogic = await SimpleToken.new()
    ammLogic = await MinterAmm.new()
    marketsRegistryLogic = await MarketsRegistry.new()

    deployedLockdown = await Lockdown.new(ownerAccount)
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

    // get the new AMM address from the AmmCreated event
    const ammAddress = ret.logs[2].args["0"]
    deployedAmm = await MinterAmm.at(ammAddress)

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

  it("should lockdown the MinterAmm, and then allow it work function normally", async () => {
    await deployedAmm.updateAmmImplementation(deployedLockdown.address)

    assert.equal(
      await deployedAmm.getLogicAddress(),
      deployedLockdown.address,
      "AMM logic address not changed",
    )

    // calls to the AMM should fail, because those functions no longer exist on the new logic contract
    await expectRevert(deployedAmm.withdrawCapital(10000, true, 0), "revert")
    await expectRevert(
      deployedAmm.bTokenBuy(marketAddress, 3000, 3000),
      "revert",
    )
    await expectRevert(
      deployedAmm.bTokenSell(marketAddress, 499e8, 0),
      "revert",
    )

    // now update the logic address to the original, and make sure we can call all the functions

    await deployedAmm.updateAmmImplementation(ammLogic.address)

    assert.equal(
      await deployedAmm.getLogicAddress(),
      ammLogic.address,
      "AMM logic address not changed",
    )

    // these error messages are from the MinterAmm contract, and thus we know the AMM logic contract got upgraded
    // back to the original
    await expectRevert(
      deployedAmm.withdrawCapital(10000, true, 0),
      "withdrawCapital: collateralMinimum must be set",
    )
    await expectRevert(
      deployedAmm.bTokenBuy(marketAddress, 3000, 3000),
      "SafeERC20: low-level call failed",
    )
    await expectRevert(
      deployedAmm.bTokenSell(marketAddress, 499e8, 0),
      "SafeERC20: low-level call failed",
    )
  })

  it("should lockdown the Market, and then allow it work function normally", async () => {
    await deployedMarketsRegistry.updateImplementationForMarket(
      deployedMarket.address,
      deployedLockdown.address,
    )

    assert.equal(
      await deployedMarket.getLogicAddress(),
      deployedLockdown.address,
      "Market logic address not changed",
    )

    // calls to the Market should fail, because those functions no longer exist on the new logic contract
    await expectRevert(deployedMarket.state(), "revert")
    await expectRevert(deployedMarket.mintOptions(1337), "revert")

    // now update the logic address to the original, and make sure we can call all the functions

    await deployedMarketsRegistry.updateImplementationForMarket(
      deployedMarket.address,
      marketLogic.address,
    )

    assert.equal(
      await deployedMarket.getLogicAddress(),
      marketLogic.address,
      "Market logic address not changed",
    )

    const state = await deployedMarket.state.call()
    assert.equal(state, STATE_OPEN)

    // these error messages are from the Market contract, and thus we know the AMM logic contract got upgraded
    // back to the original
    await expectRevert(
      deployedMarket.mintOptions(1337),
      "only restrictedMinter can mint",
    )
  })
})
