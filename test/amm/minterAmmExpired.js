/* global artifacts contract it assert */
const { time, expectEvent, BN } = require("@openzeppelin/test-helpers")
const Market = artifacts.require("Market")
const Proxy = artifacts.require("Proxy")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MockPriceOracle = artifacts.require("MockPriceOracle")

const { MarketStyle, getPriceRatio, checkBalances } = require("../util")

const NAME = "WBTC.USDC.20300101.20000"
const STRIKE_RATIO = getPriceRatio(20000, 8, 6) // 20000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

const ONE_DAY = 86400
const THIRTY_DAYS = 30 * ONE_DAY

// A number of seconds we'll use in each of the tests to fast forward to prior to expiry.
// This gives us enough leeway so that the tests can complete before the time is after
// the expiration date, in which case the options can no longer be exercised
const SECONDS_TO_EXPIRY = 10

// used to make sure claimAllExpiredTokens and individual calls to claimExpiredTokens result in the same state change
let CLAIM_ALL_EXPIRED_TOKENS_ENDING_BALANCE
let CLAIM_EXPIRED_TOKENS_ENDING_BALANCE

const STATE_OPEN = 0
const STATE_EXPIRED = 1

const ERROR_MESSAGES = {
  WITHDRAW_OPEN_EXPIRED: "withdrawCapitalOpen must be open",
  BTOKEN_BUY_NOT_OPEN: "bTokenBuy must be open",
  BTOKEN_SELL_NOT_OPEN: "bTokenSell must be open",
  WITHDRAW_EXPIRED_OPEN: "withdrawCapitalExpired must be expired",
}

/**
 * Testing the flows for expired Market contracts
 */
contract("Minter AMM Expired", (accounts) => {
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

  let firstMarketAddress

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

    const expiration = Number(await time.latest()) + THIRTY_DAYS // 30 days from now;

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
    firstMarketAddress = openMarkets[0]
  })

  it("Expired OTM with constant price", async () => {
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken.call())

    const initialCapital = 10000
    // Approve collateral
    await collateralToken.mint(ownerAccount, initialCapital)
    await collateralToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    ret = await deployedAmm.provideCapital(initialCapital, 0)

    // Now let's do some trading from another account
    await collateralToken.mint(aliceAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      initialCapital,
      "Total assets value in the AMM should be 10k",
    )

    // Check that AMM calculates correct bToken price
    assert.equal(
      await deployedAmm.getPriceForMarket.call(deployedMarket.address),
      "45052000000000000", // 0.045 * 1e18
      "AMM should calculate bToken price correctly",
    )

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(firstMarketAddress, 3000, 3000, {
      from: aliceAccount,
    })

    // Check Alice balances
    // Alice paid 184 for 3000 tokens at ~0.045 + slippage
    await checkBalances(
      aliceAccount,
      "Alice",
      collateralToken,
      paymentToken,
      bToken,
      wToken,
      lpToken,
      816,
      0,
      3000,
      0,
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
      7184,
      0,
      0,
      3000,
      0,
    )

    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10048, // ~7184 + 3000 * (1 - 0.045) (btw, 10048 > 10000 - LPs are making money!!!)
      "Total assets value in the AMM should be correct",
    )

    // Move the block time into the future so the contract is expired
    const oneDay = 60 * 60 * 24
    await time.increase(oneDay * 30 + 1)

    // Make sure market is expired
    assert.equal(
      await deployedMarket.state.call(),
      STATE_EXPIRED,
      "Market should expire",
    )

    // Check that getTokensSaleValue is 0 since there's no active tokens in the pool
    const tokensSaleValue = await deployedAmm.getTokensSaleValue(993)
    assert.equal(tokensSaleValue, 0, "tokensSaleValue should be 0")

    // Check unclaimed balances
    const {
      0: unclaimedCollateral,
      1: unclaimedPayment,
    } = await deployedAmm.getUnclaimedBalances()
    assert.equal(
      unclaimedCollateral,
      3000,
      "unclaimedCollateral should be correct",
    )
    assert.equal(unclaimedPayment, 0, "unclaimedPayment should be correct")

    // We should be able to withdraw from the closed API
    // We provided 100k in lp tokens, see if we can get it all back in 2 batches
    ret = await deployedAmm.withdrawCapital(initialCapital / 2, true, 5092)

    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "5092",
      paymentRemoved: "0",
      lpTokensBurned: "5000",
    })

    // Check Owner balances
    await checkBalances(
      ownerAccount,
      "Owner",
      collateralToken,
      paymentToken,
      bToken,
      wToken,
      lpToken,
      5092,
      0,
      0,
      0,
      5000,
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
      5092,
      0,
      0,
      0,
      0,
    )

    // Withdraw the rest
    ret = await deployedAmm.withdrawCapital(initialCapital / 2, true, 5092)

    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "5092",
      paymentRemoved: "0",
      lpTokensBurned: "5000",
    })

    // Check Owner balances
    await checkBalances(
      ownerAccount,
      "Owner",
      collateralToken,
      paymentToken,
      bToken,
      wToken,
      lpToken,
      10184,
      0,
      0,
      0,
      0, // LP made +184 profit!
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
  })

  it("Expired ITM with exercise", async () => {
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken.call())

    const initialCapital = 10000
    // Approve collateral
    await collateralToken.mint(ownerAccount, initialCapital)
    await collateralToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    ret = await deployedAmm.provideCapital(initialCapital, 0)

    // Now let's do some trading from another account
    await collateralToken.mint(aliceAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Total assets value in the AMM should be 10k.
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      initialCapital,
      "Total assets value in the AMM should be 10k",
    )

    // Check that AMM calculates correct bToken price
    assert.equal(
      await deployedAmm.getPriceForMarket.call(deployedMarket.address),
      "45052000000000000", // 0.045 * 1e18
      "AMM should calculate bToken price correctly",
    )

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(firstMarketAddress, 3000, 3000, {
      from: aliceAccount,
    })

    // Check Alice balances
    // Alice paid 184 for 3000 tokens at ~0.045 + slippage
    await checkBalances(
      aliceAccount,
      "Alice",
      collateralToken,
      paymentToken,
      bToken,
      wToken,
      lpToken,
      816,
      0,
      3000,
      0,
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
      7184,
      0,
      0,
      3000,
      0,
    )

    // Check pool value before oracle update
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      10048, // ~7184 + 3000 * (1 - 0.045) (btw, 10048 > 10000 - LPs are making money!!!)
      "Total assets value in the AMM should be correct",
    )

    // Increase Oracle price to put the option ITM
    await deployedMockPriceOracle.setLatestAnswer(25_000 * 10 ** 8)

    // Check options price after price change
    assert.equal(
      await deployedAmm.getPriceForMarket.call(deployedMarket.address),
      "280450000000000000", // 0.28 * 1e18
      "AMM should calculate bToken price correctly",
    )
    // Check pool value after oracle update
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      9342, // LPs are down by 706 = (0.28 - 0.045) * 3000
      "Total assets value in the AMM should be correct",
    )

    // Move the block time into the exercise window
    await time.increase(THIRTY_DAYS - ONE_DAY)

    // Alice exercises her options
    // 2,000(amount) * 20,000(strike) / 1e2 (decimals adj.) = 400,000 payment token
    const exercisePayment = new BN("2000")
      .mul(STRIKE_RATIO)
      .div(new BN("10").pow(new BN("18")))
    await paymentToken.mint(aliceAccount, exercisePayment)
    await paymentToken.approve(deployedMarket.address, exercisePayment, {
      from: aliceAccount,
    })
    await deployedMarket.exerciseOption(2000, { from: aliceAccount })

    // Check Alice balances
    // She had 816 collateral + 2000 exercised
    // Alice profit = 2816 - 1000 - 400,000 * 1e8 / (25,000 * 1e6) = 216
    await checkBalances(
      aliceAccount,
      "Alice",
      collateralToken,
      paymentToken,
      bToken,
      wToken,
      lpToken,
      2816,
      0,
      1000,
      0,
      0,
    )

    // Move the block time into the future so the contract is expired
    await time.increase(ONE_DAY)

    // Make sure market is expired
    assert.equal(
      await deployedMarket.state.call(),
      STATE_EXPIRED,
      "Market should expire",
    )

    // Check unclaimed balances
    const {
      0: unclaimedCollateral,
      1: unclaimedPayment,
    } = await deployedAmm.getUnclaimedBalances()
    assert.equal(
      unclaimedCollateral,
      1000,
      "unclaimedCollateral should be correct",
    )
    assert.equal(unclaimedPayment, 400000, "unclaimedPayment should be correct")

    // Check total value with and without unclaimed payment token
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(false),
      7184, // only collateral is valued, wTokens are expired
      "Total assets value excluding unclaimed in the AMM should be correct",
    )
    assert.equal(
      await deployedAmm.getTotalPoolValue.call(true),
      9784, // 7184 (collateral balance) + 1000 (unclaimed collateral) + 1600 (value of 400K payment token at 25K)
      "Total assets value in the AMM should be correct",
    )

    // Deposit additional liquidity after the exercise
    await collateralToken.mint(bobAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: bobAccount,
    })
    ret = await deployedAmm.provideCapital(1000, 0, { from: bobAccount })
    await checkBalances(
      bobAccount,
      "Bob",
      collateralToken,
      paymentToken,
      bToken,
      wToken,
      lpToken,
      0,
      0,
      0,
      0,
      1022,
    )

    // Bob withdraws liquidty
    ret = await deployedAmm.withdrawCapital(1022, true, 851, {
      from: bobAccount,
    })
    await checkBalances(
      bobAccount,
      "Bob",
      collateralToken,
      paymentToken,
      bToken,
      wToken,
      lpToken,
      851,
      37089, // ~148 value, so total is 851 + 148 = ~1000 (exactly the amount Bob deposited initially)
      0,
      0,
      0,
    )

    // We should be able to withdraw
    // We provided 100k in lp tokens, see if we can get it all back in 2 batches
    ret = await deployedAmm.withdrawCapital(initialCapital / 2, true, 4092)

    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "4166",
      paymentRemoved: "181455",
      lpTokensBurned: "5000",
    })

    // Check Owner balances
    await checkBalances(
      ownerAccount,
      "Owner",
      collateralToken,
      paymentToken,
      bToken,
      wToken,
      lpToken,
      4166,
      181455,
      0,
      0,
      5000,
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
      4167,
      181456,
      0,
      0,
      0,
    )

    // Owner withdraws the rest of the pool
    ret = await deployedAmm.withdrawCapital(initialCapital / 2, true, 4167)

    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "4167",
      paymentRemoved: "181456",
      lpTokensBurned: "5000",
    })

    // Check Owner balances
    // Total LP loss = 10,000 - 8,333 - 362,911 * 1e8 / (25,000 * 1e6) = 215
    await checkBalances(
      ownerAccount,
      "Owner",
      collateralToken,
      paymentToken,
      bToken,
      wToken,
      lpToken,
      8333,
      362911,
      0,
      0,
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
  })

  it("should claimExpiredTokens succeed", async () => {
    expiration = Number(await time.latest()) + THIRTY_DAYS // 30 days from now;

    // create another market so we can call claimExpiredTokens on multiple markets
    await deployedMarketsRegistry.createMarket(
      `${NAME}2`,
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
      `${NAME}2`,
    )
    const otherDeployedMarket = await Market.at(deployedMarketAddress)
    const openMarkets = await deployedAmm.getMarkets()
    const secondMarketAddress = openMarkets[1]

    const initialCapital = 10000
    // Approve collateral
    await collateralToken.mint(ownerAccount, initialCapital)
    await collateralToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    ret = await deployedAmm.provideCapital(initialCapital, 0)

    // Now let's do some trading from another account
    const aliceCollateralAmount = 1000
    await collateralToken.mint(aliceAccount, aliceCollateralAmount)
    await collateralToken.approve(deployedAmm.address, aliceCollateralAmount, {
      from: aliceAccount,
    })

    const BUY_AMOUNT = 3000

    // Buy bTokens from first market
    ret = await deployedAmm.bTokenBuy(
      firstMarketAddress,
      BUY_AMOUNT,
      BUY_AMOUNT,
      { from: aliceAccount },
    )

    // Buy bTokens from second market
    ret = await deployedAmm.bTokenBuy(
      secondMarketAddress,
      BUY_AMOUNT,
      BUY_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    // now there should be wTokens in the AMM
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const otherWToken = await SimpleToken.at(
      await otherDeployedMarket.wToken.call(),
    )

    // AMM should have non-zero amount of wTokens in both markets, which later
    // it will claim
    assert.equal(
      await wToken.balanceOf.call(deployedAmm.address),
      BUY_AMOUNT,
      `deployedAmm should have correct wToken balance`,
    )
    assert.equal(
      await otherWToken.balanceOf.call(deployedAmm.address),
      BUY_AMOUNT,
      `deployedAmm should have correct otherWToken balance`,
    )

    // Move the block time into the future so the contract is expired
    const oneDay = 60 * 60 * 24
    await time.increase(oneDay * 30 + 1)

    // Make sure market is expired
    assert.equal(
      await deployedMarket.state.call(),
      STATE_EXPIRED,
      "Market should expire",
    )

    assert.equal(
      await await collateralToken.balanceOf.call(deployedMarket.address),
      BUY_AMOUNT,
      "Market should have some collateral token",
    )

    assert.equal(
      await await paymentToken.balanceOf.call(deployedMarket.address),
      0,
      "Market should have 0 payment token",
    )

    // now claim all of the tokens across all markets
    const ammCollateralBeforeClaims = await collateralToken.balanceOf.call(
      deployedAmm.address,
    )
    assert.equal(ammCollateralBeforeClaims, 4398)

    ret = await deployedAmm.claimExpiredTokens(
      deployedMarket.address,
      BUY_AMOUNT,
      { from: aliceAccount },
    )

    const ammCollateralAfterFirstClaim = await collateralToken.balanceOf.call(
      deployedAmm.address,
    )
    assert.equal(
      ammCollateralAfterFirstClaim,
      parseInt(ammCollateralBeforeClaims) + BUY_AMOUNT,
    )

    ret = await deployedAmm.claimExpiredTokens(
      otherDeployedMarket.address,
      BUY_AMOUNT,
      { from: aliceAccount },
    )

    CLAIM_EXPIRED_TOKENS_ENDING_BALANCE = await collateralToken.balanceOf.call(
      deployedAmm.address,
    )
    assert.equal(
      CLAIM_EXPIRED_TOKENS_ENDING_BALANCE,
      parseInt(ammCollateralBeforeClaims) + 2 * BUY_AMOUNT,
    )
  })

  it("claimAllExpiredTokens should succeed", async () => {
    expiration = Number(await time.latest()) + THIRTY_DAYS // 30 days from now;

    // create another market so we can call claimExpiredTokens on multiple markets
    await deployedMarketsRegistry.createMarket(
      `${NAME}2`,
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
      `${NAME}2`,
    )
    const otherDeployedMarket = await Market.at(deployedMarketAddress)
    const openMarkets = await deployedAmm.getMarkets()
    const secondMarketAddress = openMarkets[1]

    const initialCapital = 10000
    // Approve collateral
    await collateralToken.mint(ownerAccount, initialCapital)
    await collateralToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    ret = await deployedAmm.provideCapital(initialCapital, 0)

    // Now let's do some trading from another account
    const aliceCollateralAmount = 1000
    await collateralToken.mint(aliceAccount, aliceCollateralAmount)
    await collateralToken.approve(deployedAmm.address, aliceCollateralAmount, {
      from: aliceAccount,
    })

    const BUY_AMOUNT = 3000

    // Buy bTokens from first market
    ret = await deployedAmm.bTokenBuy(
      firstMarketAddress,
      BUY_AMOUNT,
      BUY_AMOUNT,
      { from: aliceAccount },
    )

    // Buy bTokens from second market
    ret = await deployedAmm.bTokenBuy(
      secondMarketAddress,
      BUY_AMOUNT,
      BUY_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    // now there should be wTokens in the AMM
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const otherWToken = await SimpleToken.at(
      await otherDeployedMarket.wToken.call(),
    )

    // AMM should have non-zero amount of wTokens in both markets, which later
    // it will claim
    assert.equal(
      await wToken.balanceOf.call(deployedAmm.address),
      BUY_AMOUNT,
      `deployedAmm should have correct wToken balance`,
    )
    assert.equal(
      await otherWToken.balanceOf.call(deployedAmm.address),
      BUY_AMOUNT,
      `deployedAmm should have correct otherWToken balance`,
    )

    // Move the block time into the future so the contract is expired
    const oneDay = 60 * 60 * 24
    await time.increase(oneDay * 30 + 1)

    // Make sure market is expired
    assert.equal(
      await deployedMarket.state.call(),
      STATE_EXPIRED,
      "Market should expire",
    )

    assert.equal(
      await await collateralToken.balanceOf.call(deployedMarket.address),
      BUY_AMOUNT,
      "Market should have some collateral token",
    )

    assert.equal(
      await await paymentToken.balanceOf.call(deployedMarket.address),
      0,
      "Market should have 0 payment token",
    )

    // now claim all of the tokens across all markets
    const ammCollateralBeforeClaims = await collateralToken.balanceOf.call(
      deployedAmm.address,
    )
    assert.equal(ammCollateralBeforeClaims, 4398)

    ret = await deployedAmm.claimAllExpiredTokens({ from: aliceAccount })

    CLAIM_ALL_EXPIRED_TOKENS_ENDING_BALANCE = await collateralToken.balanceOf.call(
      deployedAmm.address,
    )
    assert.equal(
      CLAIM_ALL_EXPIRED_TOKENS_ENDING_BALANCE,
      parseInt(ammCollateralBeforeClaims) + 2 * BUY_AMOUNT,
    )
  })

  after(async () => {
    // there is a final test here where we compare the ending collateralToken balances
    // between when we call claimAllExpiredTokens and calling claimExpiredTokens on all
    // the markets. They should have the same ending balance state
    assert(
      CLAIM_ALL_EXPIRED_TOKENS_ENDING_BALANCE.eq(
        CLAIM_EXPIRED_TOKENS_ENDING_BALANCE,
      ),
      `claimAllExpiredTokens: ${CLAIM_ALL_EXPIRED_TOKENS_ENDING_BALANCE} and claimExpiredTokens:
      ${CLAIM_EXPIRED_TOKENS_ENDING_BALANCE} over all markets should product same result`,
    )
  })
})
