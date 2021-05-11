/* global artifacts contract it assert */
const {
  expectRevert,
  time,
  expectEvent,
  BN,
} = require("@openzeppelin/test-helpers")
const Market = artifacts.require("Market")
const Proxy = artifacts.require("Proxy")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MockPriceOracle = artifacts.require("MockPriceOracle")

const TestHelpers = require("../testHelpers")
const { MarketStyle, getPriceRatio, checkBalances } = require("../util")

const NAME = "WBTC.USDC.20300101.20000"
const STRIKE_RATIO = getPriceRatio(20000, 8, 6) // 20000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

const STATE_OPEN = 0
const STATE_EXPIRED = 1

const oneDay = 60 * 60 * 24
const oneWeek = 7 * oneDay

const ERROR_MESSAGES = {
  WITHDRAW_OPEN_EXPIRED: "withdrawCapitalOpen must be open",
  BTOKEN_BUY_NOT_OPEN: "bTokenBuy must be open",
  BTOKEN_SELL_NOT_OPEN: "bTokenSell must be open",
  WITHDRAW_EXPIRED_OPEN: "withdrawCapitalExpired must be expired",
}

/**
 * Testing the flows for the Market Contract
 */
contract("Minter AMM Gas Measurement", (accounts) => {
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

    expiration = Number(await time.latest()) + 30 * oneDay // 30 days from now;

    deployedMockPriceOracle = await MockPriceOracle.new(
      await collateralToken.decimals.call(),
    )
    await deployedMockPriceOracle.setLatestAnswer(BTC_ORACLE_PRICE)
  })

  it("Measures gas for single-market: 0 open and 1 expired", async () => {
    await measureGas(0, 1)
  })

  it("Measures gas for 2 markets: 0 open and 2 expired", async () => {
    await measureGas(0, 2)
  })

  it("Measures gas for 4 markets: 1 open and 3 expired", async () => {
    await measureGas(1, 3)
  })

  it("Measures gas for 8 markets: 8 open and 0 expired", async () => {
    await measureGas(8, 0)
  })

  ////////////////////////// use xit here so we don't slow test runs down /////////////////////
  //////////////// we keep these tests here to easily see gas usage later on //////////////////
  xit("Measures gas for 12 markets: 8 open and 4 expired", async () => {
    await measureGas(8, 4)
  })

  xit("Measures gas for 16 markets: 8 open and 8 expired", async () => {
    await measureGas(8, 8)
  })

  xit("Measures gas for 20 markets: 8 open and 12 expired", async () => {
    await measureGas(8, 12)
  })

  measureGas = async (numOpenMarkets, numExpiredMarkets) => {
    const numMarkets = numOpenMarkets + numExpiredMarkets
    console.log("**************************************************")
    console.log(
      `Measuring gas for AMM with ${numMarkets}: ${numOpenMarkets} open markets and ${numExpiredMarkets} expired markets:`,
    )
    console.log("**************************************************")

    // Initialize the AMM
    let ret = await deployedAmm.initialize(
      deployedMarketsRegistry.address,
      deployedMockPriceOracle.address,
      paymentToken.address,
      collateralToken.address,
      lpTokenLogic.address,
      0,
      false,
    )

    // All our production + rinkeby AMMs have this set, which causes
    // MinterAmm.provideCapital to cost more gas, so we should set it
    // here too. Though we set the globalLimit to a ridiculously
    // high number so it will never be triggered
    await deployedAmm.setEnforceDepositLimits(true, "10000000000000000")

    const markets = []
    for (let i = 0; i < numMarkets; i++) {
      // Deploy additional markets
      const marketName = `${NAME}_${i}`
      await deployedMarketsRegistry.createMarket(
        marketName,
        collateralToken.address,
        paymentToken.address,
        MarketStyle.EUROPEAN_STYLE,
        STRIKE_RATIO,
        expiration + i * oneWeek,
        0,
        0,
        0,
        deployedAmm.address,
      )

      const deployedMarketAddress = await deployedMarketsRegistry.markets.call(
        marketName,
      )
      const deployedMarket = await Market.at(deployedMarketAddress)
      markets.push(deployedMarket)
    }

    const lpToken = await SimpleToken.at(await deployedAmm.lpToken.call())

    const initialCapital = 100000
    // Approve collateral
    await collateralToken.mint(ownerAccount, initialCapital)
    await collateralToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    ret = await deployedAmm.provideCapital(initialCapital, 0)
    printGasLog("Initial LP deposit", ret.receipt.gasUsed)
    assert.isBelow(
      ret.receipt.gasUsed,
      150_000,
      "Initial LP deposit gas should be below threshold",
    )

    // Now let's do some trading from another account
    await collateralToken.mint(aliceAccount, 5000 * numMarkets)
    await collateralToken.approve(deployedAmm.address, 5000 * numMarkets, {
      from: aliceAccount,
    })

    const openMarkets = await deployedAmm.getMarkets()

    for (let i = 0; i < numMarkets; i++) {
      const deployedMarket = markets[i]
      const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
      const wToken = await SimpleToken.at(await deployedMarket.wToken.call())

      // Buy bTokens
      const marketAddress = openMarkets[i]
      ret = await deployedAmm.bTokenBuy(marketAddress, 3000, 3000, {
        from: aliceAccount,
      })
      printGasLog("bTokenBuy 1", ret.receipt.gasUsed)
      assert.isBelow(
        ret.receipt.gasUsed,
        320_000, // TODO: this is too high, we should aim for <= 200K
        "bTokenBuy gas should be below threshold",
      )

      // Buy more bTokens
      ret = await deployedAmm.bTokenBuy(openMarkets[i], 3000, 3000, {
        from: aliceAccount,
      })
      printGasLog("bTokenBuy 2", ret.receipt.gasUsed)
      assert.isBelow(
        ret.receipt.gasUsed,
        250_000, // TODO: this is too high, we should aim for <= 200K
        "bTokenBuy gas should be below threshold",
      )

      // Sell bTokens
      await bToken.approve(deployedAmm.address, 2000, {
        from: aliceAccount,
      })
      ret = await deployedAmm.bTokenSell(openMarkets[i], 1000, 0, {
        from: aliceAccount,
      })
      printGasLog("bTokenSell 1", ret.receipt.gasUsed)
      assert.isBelow(
        ret.receipt.gasUsed,
        300_000, // TODO: this is too high, we should aim for <= 200K
        "bTokenSell gas should be below threshold",
      )

      // Sell more bTokens
      ret = await deployedAmm.bTokenSell(openMarkets[i], 1000, 0, {
        from: aliceAccount,
      })
      printGasLog("bTokenSell 2", ret.receipt.gasUsed)
      assert.isBelow(
        ret.receipt.gasUsed,
        250_000, // TODO: this is too high, we should aim for <= 200K
        "bTokenSell gas should be below threshold",
      )
    }

    // Withdraw some liquidity
    ret = await deployedAmm.withdrawCapital(initialCapital / 2, true, 10000)
    printGasLog("Post-sale LP withdrawal", ret.receipt.gasUsed)
    assert.isBelow(
      ret.receipt.gasUsed,
      1_000_000, // TODO: try bringing this lower
      "withdrawCapital gas should be below threshold",
    )

    // Provide capital again
    await collateralToken.approve(
      deployedAmm.address,
      Math.floor(initialCapital / 10),
    )
    ret = await deployedAmm.provideCapital(Math.floor(initialCapital / 10), 0)
    printGasLog("Post-sale LP deposit", ret.receipt.gasUsed)
    assert.isBelow(
      ret.receipt.gasUsed,
      1_000_000,
      "LP deposit gas should be below threshold",
    )

    // Move the block time into the future so exactly numExpiredMarkets number
    // of markets are expired
    await time.increaseTo(expiration + numExpiredMarkets * oneWeek - 60) // subtract a minute to account for the rest of the test running

    if (numExpiredMarkets > 0) {
      // Make sure market is expired
      assert.equal(
        await markets[numExpiredMarkets - 1].state.call(),
        STATE_EXPIRED,
        "Market should expire",
      )
    }

    // Get LP token balance
    const lpTokenBalance = await lpToken.balanceOf.call(ownerAccount)
    // console.log("lpTokenBalance", lpTokenBalance.toString())

    // Partial withdrawal post-expiry
    ret = await deployedAmm.withdrawCapital(1000, true, 1)
    printGasLog("Post-expiry withdrawal 1", ret.receipt.gasUsed)
    assert.isBelow(
      ret.receipt.gasUsed,
      1_000_000, // TODO: too high for 8 markets
      "Post-expiry withdrawal 1 gas should be below threshold",
    )

    // Full withdrawal post-expiry
    ret = await deployedAmm.withdrawCapital(
      lpTokenBalance.sub(new BN(1000)),
      true,
      1,
    )
    printGasLog("Post-expiry withdrawal 2", ret.receipt.gasUsed)
    assert.isBelow(
      ret.receipt.gasUsed,
      600_000, // TODO: too high for 4-8 markets
      "Post-expiry withdrawal 2 gas should be below threshold",
    )

    // Check end-balances for all markets
    const ownerCollateralBalance = await collateralToken.balanceOf.call(
      ownerAccount,
    )
    for (let i = 0; i < numMarkets; i++) {
      const deployedMarket = markets[i]
      const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
      const wToken = await SimpleToken.at(await deployedMarket.wToken.call())

      // Check LP balances
      await checkBalances(
        ownerAccount,
        "Owner",
        collateralToken,
        paymentToken,
        bToken,
        wToken,
        lpToken,
        ownerCollateralBalance.toString(),
        0,
        0,
        (await wToken.balanceOf.call(ownerAccount)).toString(),
        0,
      )

      // Check AMM balances
      await checkBalances(
        deployedAmm.address,
        "AMM",
        collateralToken,
        paymentToken,
        bToken,
        wToken,
        lpToken,
        0,
        0,
        0,
        0,
        0,
      )
    }
  }

  printGasLog = (opName, gasUsed) => {
    var formatted = gasUsed.toLocaleString("en-US", {
      minimumFractionDigits: 0,
    })

    console.log(`${opName}:`.padEnd(50, " "), formatted)
  }
})
