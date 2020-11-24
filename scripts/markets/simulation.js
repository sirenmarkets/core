/* global artifacts contract it assert */
const { time } = require("@openzeppelin/test-helpers")
const Market = artifacts.require("Market")
const Proxy = artifacts.require("Proxy")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MockPriceOracle = artifacts.require("MockPriceOracle")

const { MarketStyle, getPriceRatio } = require("../../test/util")

// Inputs
const FEE_BP = 0 // 200 basis points = 2%

const NAME = "WBTC.USDC.20300101.50000"
const STRIKE_RATIO = getPriceRatio(15000, 8, 6) // 15000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC
const SHOULD_INVERT_ORACLE_PRICE = false

const MAX_INT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935"

const STATE_OPEN = 0
const STATE_EXPIRED = 1

/**
 * Testing the flows for the Market Contract
 */

const prepareSimulation = async () => {
  const accounts = await web3.eth.getAccounts()
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const carolAccount = accounts[3]
  let marketLogic
  let tokenLogic
  let ammLogic
  let lpTokenLogic
  let deployedAmm
  let deployedMarketsRegistry
  let deployedMockPriceOracle
  let deployedMarket

  let collateralToken
  let paymentToken

  // These logic contracts are what the proxy contracts will point to
  marketLogic = await Market.new()
  tokenLogic = await SimpleToken.new()
  ammLogic = await MinterAmm.new()
  lpTokenLogic = await SimpleToken.new()
  marketsRegistryLogic = await MarketsRegistry.new()

  // Create a collateral token
  collateralToken = await SimpleToken.new()
  await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

  // Create a payment token
  paymentToken = await SimpleToken.new()
  await paymentToken.initialize("USD Coin", "USDC", 6)

  // Create a new proxy contract pointing at the markets registry logic for testing
  const proxyContract = await Proxy.new(marketsRegistryLogic.address)
  deployedMarketsRegistry = await MarketsRegistry.at(proxyContract.address)
  deployedMarketsRegistry.initialize(
    tokenLogic.address,
    marketLogic.address,
    ammLogic.address,
  )

  // Oracle
  deployedMockPriceOracle = await MockPriceOracle.new(
    await collateralToken.decimals.call(),
  )
  await deployedMockPriceOracle.setLatestAnswer(BTC_ORACLE_PRICE)

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

  const deployedMarketAddress = await deployedMarketsRegistry.markets.call(NAME)
  deployedMarket = await Market.at(deployedMarketAddress)

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

  console.log(`deployedOracle`, deployedMockPriceOracle.address)
  console.log(`deployedMarket`, deployedMarket.address)
  console.log(`deployedAmm`, deployedAmm.address)
  console.log(`collateralToken`, collateralToken.address)
  console.log(`paymentToken`, paymentToken.address)
  console.log(`bToken`, await deployedMarket.bToken.call())
  console.log(`wToken`, await deployedMarket.wToken.call())
  console.log(`lpToken`, await deployedAmm.lpToken.call())

  const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
  const wToken = await SimpleToken.at(await deployedMarket.wToken.call())

  const liquidity = 1000000e8

  // Approve collateral
  await collateralToken.mint(ownerAccount, liquidity)
  await collateralToken.approve(deployedAmm.address, liquidity)

  // Provide capital
  ret = await deployedAmm.provideCapital(1000000e8, 1000000e8)

  // Give collateral token to account
  await collateralToken.mint(aliceAccount, 10000000e8)
  await collateralToken.approve(deployedAmm.address, MAX_INT, {
    from: aliceAccount,
  })

  // Approve bToken and wToken for trading
  await bToken.approve(deployedAmm.address, MAX_INT, { from: aliceAccount })
  await wToken.approve(deployedAmm.address, MAX_INT, { from: aliceAccount })
}

module.exports = async (callback) => {
  try {
    await prepareSimulation()
    callback()
  } catch (e) {
    callback(e)
  }
}
