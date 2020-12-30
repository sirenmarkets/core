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
  INVALID_ARRAY: "Invalid arrays",
  LP_OVER_LIMIT: "Pool over deposit limit",
}

/**
 * Testing the flows for the Market Contract
 */
contract("Deposit Limits", (accounts) => {
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

    const ammProxy = await Proxy.new(ammLogic.address)
    deployedAmm = await MinterAmm.at(ammProxy.address)

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

    deployedMockPriceOracle = await MockPriceOracle.new(
      await collateralToken.decimals.call(),
    )
    await deployedMockPriceOracle.setLatestAnswer(BTC_ORACLE_PRICE)
  })

  it("Enforces Limits", async () => {
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

    // Ensure a non-owner can't edit the flag for enabling deposit limits
    await expectRevert(
      deployedAmm.setEnforceDepositLimits(true, "100", { from: bobAccount }),
      ERROR_MESSAGES.UNAUTHORIZED,
    )

    // Enable it with the owner account
    ret = await deployedAmm.setEnforceDepositLimits(true, "200", {
      from: ownerAccount,
    })
    expectEvent(ret, "EnforceDepositLimitsUpdated", {
      isEnforced: true,
      globalLimit: "200",
    })

    // Verify carol can't deposit any since she isn't authorized
    await collateralToken.mint(carolAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000, {
      from: carolAccount,
    })
    await expectRevert(
      deployedAmm.provideCapital(10000, 0, { from: carolAccount }),
      ERROR_MESSAGES.LP_OVER_LIMIT,
    )

    // Verify Alice can only deposit her limit
    await collateralToken.mint(aliceAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000, {
      from: aliceAccount,
    })
    // Fails
    await expectRevert(
      deployedAmm.provideCapital(10000, 0, { from: aliceAccount }),
      ERROR_MESSAGES.LP_OVER_LIMIT,
    )
    // Works under limit
    await deployedAmm.provideCapital(200, 0, { from: aliceAccount })
    // Fails after limit hit
    await expectRevert(
      deployedAmm.provideCapital(200, 0, { from: aliceAccount }),
      ERROR_MESSAGES.LP_OVER_LIMIT,
    )

    // Mint and approve for bob to deposit
    await collateralToken.mint(bobAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000, {
      from: bobAccount,
    })

    // Verify bob cannot deposit since the limit has already been reached
    await expectRevert(
      deployedAmm.provideCapital(100, 0, { from: bobAccount }),
      ERROR_MESSAGES.LP_OVER_LIMIT,
    )

    // Let alice pull out 100
    await deployedAmm.withdrawCapital(100, true, 100, { from: aliceAccount })

    // Now bob should be able to deposit
    await deployedAmm.provideCapital(100, 0, { from: bobAccount })
  })
})
