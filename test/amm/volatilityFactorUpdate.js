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
const STRIKE_RATIO = getPriceRatio(15000, 8, 6) // 15000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC
const SHOULD_INVERT_ORACLE_PRICE = false

const ERROR_MESSAGES = {
  UNAUTHORIZED: "Ownable: caller is not the owner.",
  VOL_TOO_LOW: "VolatilityFactor is too low",
}

/**
 * Testing the flows for the Market Contract
 */
contract("Volatility Factor", (accounts) => {
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

  let expiration

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

    // Create a new proxy contract pointing at the marketsRegistry logic for testing
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

    expiration = Number(await time.latest()) + 30 * 86400 // 30 days from now;

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
  })

  it("Enforces Limits", async () => {
    // Ensure an non-owner can't edit the vol factor
    await expectRevert(
      deployedAmm.setVolatilityFactor("10000001", { from: bobAccount }),
      ERROR_MESSAGES.UNAUTHORIZED,
    )

    // Ensure lower bound is enforced
    await expectRevert(
      deployedAmm.setVolatilityFactor("1000", { from: ownerAccount }),
      ERROR_MESSAGES.VOL_TOO_LOW,
    )

    const newVol = new BN(1000).mul(new BN(10).pow(new BN(10)))

    // Set it with the owner account
    ret = await deployedAmm.setVolatilityFactor(newVol, { from: ownerAccount })
    expectEvent(ret, "VolatilityFactorUpdated", {
      newVolatilityFactor: newVol,
    })

    // Verify it got set correctly
    assert.equal(
      await deployedAmm.volatilityFactor.call(),
      newVol.toString(),
      "Vol factor should be set",
    )
  })
})
