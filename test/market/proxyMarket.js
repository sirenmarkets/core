/* global artifacts contract it assert */
const {
  expectRevert,
  time,
  expectEvent,
  BN,
} = require("@openzeppelin/test-helpers")
const { MarketStyle } = require("../util")
const Market = artifacts.require("Market")
const Proxy = artifacts.require("Proxy")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")
const TestHelpers = require("../testHelpers")

const NAME = "WBTC.USDC.20300101.50000"
const STRIKE_RATIO = 50000
const EXPIRATION = 1893456000

const EXERCISE_FEE = 1
const CLOSE_FEE = 2
const CLAIM_FEE = 3

const STATE_OPEN = 0
const STATE_EXPIRED = 1

// A number of seconds we'll use in each of the tests to fast forward to prior to expiry.
// This gives us enough leeway so that the tests can complete before the time is after
// the expiration date, in which case the options can no longer be exercised
const SECONDS_TO_EXPIRY = 10

const ERROR_MESSAGES = {
  CANNOT_EXERCISE_EXPIRED: "Option contract must be in Open State to exercise",
  CANNOT_EXERCISE_PRIOR_EXERCISE_WINDOW:
    "Option contract cannot yet be exercised",
  CANNOT_CLAIM_OPEN:
    "Option contract must be in EXPIRED State to claim collateral",
  CANNOT_CLOSE_EXPIRED:
    "Option contract must be in Open State to close a position",
  CANNOT_MINT_NOT_OPEN: "Option contract must be in Open State to mint",
  NOT_ENOUGH_BALANCE: "ERC20: transfer amount exceeds balance",
  NOT_APPROVED_BALANCE: "ERC20: transfer amount exceeds allowance",
  NON_MINTER: "mintOptions: only restrictedMinter can mint",
}

/**
 * Testing the flows for the Market Contract
 */
contract("Proxy Market Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const carolAccount = accounts[3]
  let marketLogic
  let tokenLogic
  let deployedMarket
  let ammLogic

  let collateralToken
  let paymentToken

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    marketLogic = await Market.deployed()
    tokenLogic = await SimpleToken.deployed()
    ammLogic = { address: TestHelpers.ADDRESS_ZERO }

    // Create a collateral token
    collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)
  })

  beforeEach(async () => {
    // Create a new proxy contract pointing at the market logic for testing
    const proxyContract = await Proxy.new(marketLogic.address)
    deployedMarket = await Market.at(proxyContract.address)
  })

  it("Initializes", async () => {
    const ret = await deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO,
      EXPIRATION,
      EXERCISE_FEE,
      CLOSE_FEE,
      CLAIM_FEE,
      tokenLogic.address,
    )

    assert.equal(
      await deployedMarket.marketName.call(),
      NAME,
      "Name should be set correctly",
    )
    assert.equal(
      await deployedMarket.collateralToken.call(),
      collateralToken.address,
      "collateralToken should be set correctly",
    )
    assert.equal(
      await deployedMarket.paymentToken.call(),
      paymentToken.address,
      "paymentToken should be set correctly",
    )
    assert.equal(
      await deployedMarket.marketStyle.call(),
      MarketStyle.EUROPEAN_STYLE,
      "marketStyle should be set correctly",
    )
    assert.equal(
      await deployedMarket.priceRatio.call(),
      STRIKE_RATIO,
      "STRIKE_RATIO should be set correctly",
    )
    assert.equal(
      await deployedMarket.expirationDate.call(),
      EXPIRATION,
      "EXPIRATION should be set correctly",
    )
    assert.equal(
      await deployedMarket.state.call(),
      STATE_OPEN,
      "STATE should be set correctly",
    )

    // Fees
    assert.equal(
      await deployedMarket.exerciseFeeBasisPoints.call(),
      EXERCISE_FEE,
      "EXERCISE_FEE should be set correctly",
    )
    assert.equal(
      await deployedMarket.closeFeeBasisPoints.call(),
      CLOSE_FEE,
      "CLOSE_FEE should be set correctly",
    )
    assert.equal(
      await deployedMarket.claimFeeBasisPoints.call(),
      CLAIM_FEE,
      "CLAIM_FEE should be set correctly",
    )

    // Owner should be set
    assert.equal(
      await deployedMarket.owner.call(),
      ownerAccount,
      "Owner should be set",
    )

    // The bToken should be deployed and initialized
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    assert.equal(
      await bToken.totalSupply.call(),
      0,
      "totalSupply should be set correctly",
    )
    assert.equal(
      await bToken.name.call(),
      "B-" + NAME,
      "name should be set correctly",
    )
    assert.equal(
      await bToken.symbol.call(),
      "B-" + NAME,
      "symbol should be set correctly",
    )

    // The wToken should be deployed and initialized
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    assert.equal(
      await wToken.totalSupply.call(),
      0,
      "totalSupply should be set correctly",
    )
    assert.equal(
      await wToken.name.call(),
      "W-" + NAME,
      "name should be set correctly",
    )
    assert.equal(
      await wToken.symbol.call(),
      "W-" + NAME,
      "symbol should be set correctly",
    )

    assert.equal(
      await deployedMarket.restrictedMinter.call(),
      TestHelpers.ADDRESS_ZERO,
      "Restricted minter should default to 0x0",
    )

    // verify event
    expectEvent(ret, "MarketInitialized", {
      marketName: NAME,
      marketStyle: MarketStyle.EUROPEAN_STYLE.toString(),
      wToken: wToken.address,
      bToken: bToken.address,
    })
  })

  it("Calculates open and expired state", async () => {
    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO,
      expiration,
      EXERCISE_FEE,
      CLOSE_FEE,
      CLAIM_FEE,
      tokenLogic.address,
    )

    // No time has passed so should be open
    assert.equal(
      await deployedMarket.state.call(),
      STATE_OPEN,
      "STATE should be open",
    )

    // Move the block time into the future
    await time.increase(twoDays + 1)

    // Should now be expired
    assert.equal(
      await deployedMarket.state.call(),
      STATE_EXPIRED,
      "STATE should be expired after moving time",
    )
  })

  it("Mints option wTokens and bTokens", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO,
      EXPIRATION,
      EXERCISE_FEE,
      CLOSE_FEE,
      CLAIM_FEE,
      tokenLogic.address,
    )

    // It should fail to mint options before alice has approved the tokens to be transferred
    await expectRevert.unspecified(
      deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount }),
    )

    // approve the amount
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })

    // It should fail to mint more than Alice owns
    await expectRevert.unspecified(
      deployedMarket.mintOptions(MINT_AMOUNT + 1, { from: aliceAccount }),
    )

    // It should succeed
    const ret = await deployedMarket.mintOptions(MINT_AMOUNT, {
      from: aliceAccount,
    })

    // Verify the event
    expectEvent.inLogs(ret.logs, "OptionMinted", {
      minter: aliceAccount,
      value: MINT_AMOUNT.toString(),
    })

    // Verify alice has 100 wTokens and 100 bTokens
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    assert.equal(
      await wToken.balanceOf.call(aliceAccount),
      MINT_AMOUNT,
      "wToken MINT_AMOUNT should be set correctly",
    )
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    assert.equal(
      await bToken.balanceOf.call(aliceAccount),
      MINT_AMOUNT,
      "bToken MINT_AMOUNT should be set correctly",
    )
  })

  it("Blocks redeem if expired", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO,
      expiration,
      EXERCISE_FEE,
      CLOSE_FEE,
      CLAIM_FEE,
      tokenLogic.address,
    )

    // approve the amount
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })

    // It should succeed to mint bTokens
    await deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount })

    // Move the block time into the future
    await time.increase(twoDays + 1)

    // It should fail to redeem since the contract is expired
    await expectRevert(
      deployedMarket.exerciseOption(MINT_AMOUNT, { from: aliceAccount }),
      ERROR_MESSAGES.CANNOT_EXERCISE_EXPIRED,
    )
  })

  it("Blocks redeem if prior to start of the exercise window", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE_RATIO,
      expiration,
      EXERCISE_FEE,
      CLOSE_FEE,
      CLAIM_FEE,
      tokenLogic.address,
    )

    // approve the amount
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })

    // It should succeed to mint bTokens
    await deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount })

    // Move the block time into the future, but prior to the start of the exercise window
    const oneDay = 24 * 60 * 60

    await time.increase(twoDays - oneDay - SECONDS_TO_EXPIRY)

    // It should fail to redeem since current time is still prior to the
    // start of the exercise window
    await expectRevert(
      deployedMarket.exerciseOption(MINT_AMOUNT, { from: aliceAccount }),
      ERROR_MESSAGES.CANNOT_EXERCISE_PRIOR_EXERCISE_WINDOW,
    )
  })

  it("Allows redeem for European-style option", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    // Price ratio will be 10k base units of usdc per wbtc
    const priceRatio = new BN(10000).mul(new BN(10).pow(new BN(18)))

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      priceRatio,
      expiration,
      0, // 0 fees
      0, // 0 fees
      0, // 0 fees
      tokenLogic.address,
    )

    // Give Alice 100 collateral tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // approve the amount and mint alice some options
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })

    // Move the block time into the future during the exercise window but before expiration
    await time.increase(twoDays - SECONDS_TO_EXPIRY)

    await deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount })

    // send bTokens to bob (as if bob bought the bTokens)
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    await bToken.transfer(bobAccount, MINT_AMOUNT, { from: aliceAccount })

    // Bob should fail to redeem since he doesn't have any payment tokens
    await expectRevert.unspecified(
      deployedMarket.exerciseOption(MINT_AMOUNT, { from: bobAccount }),
    )

    // Mint bob the amount of tokens he needs
    await paymentToken.mint(bobAccount, MINT_AMOUNT * 10000)

    // Bob should fail to redeem since he hasn't approved tokens
    await expectRevert.unspecified(
      deployedMarket.exerciseOption(MINT_AMOUNT, { from: bobAccount }),
    )

    // Bob should approve
    await paymentToken.approve(deployedMarket.address, MINT_AMOUNT * 10000, {
      from: bobAccount,
    })

    // Should succeed now
    const ret = await deployedMarket.exerciseOption(MINT_AMOUNT, {
      from: bobAccount,
    })

    // Redeem event should have been called
    expectEvent.inLogs(ret.logs, "OptionExercised", {
      redeemer: bobAccount,
      value: MINT_AMOUNT.toString(),
    })

    // All of Bob's bTokens and payment tokens should be gone
    assert.equal(
      await bToken.balanceOf.call(bobAccount),
      0,
      "bToken should be redeemed",
    )
    assert.equal(
      await paymentToken.balanceOf.call(bobAccount),
      0,
      "paymentToken should be redeemed",
    )

    // Bob should now own all the collateral tokens
    assert.equal(
      await collateralToken.balanceOf.call(bobAccount),
      MINT_AMOUNT,
      "collateralToken should be redeemed",
    )
  })

  it("Allows redeem for American-style option", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    // Price ratio will be 10k base units of usdc per wbtc
    const priceRatio = new BN(10000).mul(new BN(10).pow(new BN(18)))

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.AMERICAN_STYLE,
      priceRatio,
      expiration,
      0, // 0 fees
      0, // 0 fees
      0, // 0 fees
      tokenLogic.address,
    )

    assert.equal(
      await deployedMarket.marketStyle.call(),
      MarketStyle.AMERICAN_STYLE,
      "marketStyle should be set correctly",
    )

    // Give Alice 100 collateral tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // approve the amount and mint alice some options
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })

    await deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount })

    // send bTokens to bob (as if bob bought the bTokens)
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())
    await bToken.transfer(bobAccount, MINT_AMOUNT, { from: aliceAccount })

    // Bob should fail to redeem since he doesn't have any payment tokens
    await expectRevert.unspecified(
      deployedMarket.exerciseOption(MINT_AMOUNT, { from: bobAccount }),
    )

    // Mint bob the amount of tokens he needs
    await paymentToken.mint(bobAccount, MINT_AMOUNT * 10000)

    // Bob should fail to redeem since he hasn't approved tokens
    await expectRevert.unspecified(
      deployedMarket.exerciseOption(MINT_AMOUNT, { from: bobAccount }),
    )

    // Bob should approve
    await paymentToken.approve(deployedMarket.address, MINT_AMOUNT * 10000, {
      from: bobAccount,
    })

    // Should succeed now
    const ret = await deployedMarket.exerciseOption(MINT_AMOUNT, {
      from: bobAccount,
    })

    // Redeem event should have been called
    expectEvent.inLogs(ret.logs, "OptionExercised", {
      redeemer: bobAccount,
      value: MINT_AMOUNT.toString(),
    })

    // All of Bob's bTokens and payment tokens should be gone
    assert.equal(
      await bToken.balanceOf.call(bobAccount),
      0,
      "bToken should be redeemed",
    )
    assert.equal(
      await paymentToken.balanceOf.call(bobAccount),
      0,
      "paymentToken should be redeemed",
    )

    // Bob should now own all the collateral tokens
    assert.equal(
      await collateralToken.balanceOf.call(bobAccount),
      MINT_AMOUNT,
      "collateralToken should be redeemed",
    )
  })

  it("Allows claiming after expiration with no redemptions", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    // Price ratio will be 10k base units of usdc per wbtc
    const priceRatio = new BN(10000).mul(new BN(10).pow(new BN(18)))

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      priceRatio,
      expiration,
      0, // 0 fees
      0, // 0 fees
      0, // 0 fees
      tokenLogic.address,
    )

    // Save off the wToken
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())

    // approve the amount and mint alice some options
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })
    await deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount })

    // Alice should fail to claim since the contract is still open
    await expectRevert(
      deployedMarket.claimCollateral(MINT_AMOUNT, { from: aliceAccount }),
      ERROR_MESSAGES.CANNOT_CLAIM_OPEN,
    )

    // Move the block time into the future so the contract is expired
    await time.increase(twoDays + 1)

    // Give Carol some tokens
    await collateralToken.mint(carolAccount, MINT_AMOUNT)

    // Carol should not be able to mint new options now that it is not open
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: carolAccount,
    })
    await expectRevert(
      deployedMarket.mintOptions(MINT_AMOUNT, { from: carolAccount }),
      ERROR_MESSAGES.CANNOT_MINT_NOT_OPEN,
    )

    // Bob should fail to claim collateral since he doesn't have any tokens
    await expectRevert.unspecified(
      deployedMarket.claimCollateral(MINT_AMOUNT, { from: bobAccount }),
    )

    // Should succeed from Alice
    const ret = await deployedMarket.claimCollateral(MINT_AMOUNT, {
      from: aliceAccount,
    })

    // Claim event should have been called
    expectEvent.inLogs(ret.logs, "CollateralClaimed", {
      redeemer: aliceAccount,
      value: new BN(MINT_AMOUNT),
    })

    // All of Alices's wTokens and payment tokens should be gone
    assert.equal(
      await wToken.balanceOf.call(aliceAccount),
      0,
      "wToken should be claimed",
    )

    // Alice should now own all the collateral tokens pl
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      MINT_AMOUNT,
      "collateralToken should be claimed",
    )
  })

  it("Allows claiming after expiration with full redemptions", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Mint bob the amount of tokens he needs
    await paymentToken.mint(bobAccount, MINT_AMOUNT * 10000)

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    // Price ratio will be 10k base units of usdc per wbtc
    const priceRatio = new BN(10000).mul(new BN(10).pow(new BN(18)))

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      priceRatio,
      expiration,
      0, // 0 fees
      0, // 0 fees
      0, // 0 fees
      tokenLogic.address,
    )

    // Save off the tokens
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())

    // approve the amount and mint alice some options - wBTC collateral will be locked into market contract
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })
    await deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount })

    // Send the bTokens from alice to Bob - simulates alice selling option
    await bToken.transfer(bobAccount, MINT_AMOUNT, { from: aliceAccount })

    // Bob redeems all bTokens by paying the USDC
    await paymentToken.approve(deployedMarket.address, MINT_AMOUNT * 10000, {
      from: bobAccount,
    })

    // Move time ahead so we're within the exercise window
    await time.increase(twoDays - SECONDS_TO_EXPIRY)

    await deployedMarket.exerciseOption(MINT_AMOUNT, { from: bobAccount })

    // Move the block time into the future so the contract is expired
    await time.increase(SECONDS_TO_EXPIRY)

    // Should succeed from Alice claiming payments from bob
    await deployedMarket.claimCollateral(MINT_AMOUNT, { from: aliceAccount })

    // Alice should now own all payment tokens
    assert.equal(
      await paymentToken.balanceOf.call(aliceAccount),
      MINT_AMOUNT * 10000,
      "alice should end up with all payent",
    )

    // Bob should own all collateral tokens
    assert.equal(
      await collateralToken.balanceOf.call(bobAccount),
      MINT_AMOUNT,
      "bob should end up with all collateral",
    )
  })

  it("Allows claiming after expiration with partial redemptions", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Mint bob the amount of tokens he needs
    await paymentToken.mint(bobAccount, MINT_AMOUNT * 10000)

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    // Price ratio will be 10k base units of usdc per wbtc
    const priceRatio = new BN(10000).mul(new BN(10).pow(new BN(18)))

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      priceRatio,
      expiration,
      0, // 0 fees
      0, // 0 fees
      0, // 0 fees
      tokenLogic.address,
    )

    // Save off the tokens
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())

    // approve the amount and mint alice some options
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })
    await deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount })

    // Send the bTokens from alice to Bob
    await bToken.transfer(bobAccount, MINT_AMOUNT, { from: aliceAccount })

    // Bob redeems only half of bTokens
    await paymentToken.approve(deployedMarket.address, MINT_AMOUNT * 10000, {
      from: bobAccount,
    })

    // Move time ahead so we're within the exercise window
    await time.increase(twoDays - SECONDS_TO_EXPIRY)

    // Only redeem half
    await deployedMarket.exerciseOption(MINT_AMOUNT / 2, { from: bobAccount })

    // Move the block time into the future so the contract is expired
    await time.increase(SECONDS_TO_EXPIRY)

    // Should succeed from Alice
    await deployedMarket.claimCollateral(MINT_AMOUNT, { from: aliceAccount })

    // Alice and Bob should have split the collateral and payments
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      MINT_AMOUNT / 2,
      "alice should end up with half of collateral",
    )
    assert.equal(
      await paymentToken.balanceOf.call(aliceAccount),
      (MINT_AMOUNT * 10000) / 2,
      "alice should end up with half of payment",
    )

    assert.equal(
      await collateralToken.balanceOf.call(bobAccount),
      MINT_AMOUNT / 2,
      "bob should end up with half of collateral",
    )
    assert.equal(
      await paymentToken.balanceOf.call(bobAccount),
      (MINT_AMOUNT * 10000) / 2,
      "alice should end up with half of payment",
    )
  })

  it("Allows closing a position while open", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice and bob 100 tokens each
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)
    await collateralToken.mint(bobAccount, MINT_AMOUNT)

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    // Price ratio will be 10k base units of usdc per wbtc
    const priceRatio = new BN(10000).mul(new BN(10).pow(new BN(18)))

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      priceRatio,
      expiration,
      0, // 0 fees
      0, // 0 fees
      0, // 0 fees
      tokenLogic.address,
    )

    // Save off the tokens
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())

    // approve the amount and mint alice some options for both alice and bob
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })
    await deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount })

    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: bobAccount,
    })
    await deployedMarket.mintOptions(MINT_AMOUNT, { from: bobAccount })

    // Allow Alice to close her position
    const ret = await deployedMarket.closePosition(MINT_AMOUNT, {
      from: aliceAccount,
    })

    // Close event should have been called
    expectEvent.inLogs(ret.logs, "OptionClosed", {
      redeemer: aliceAccount,
      value: new BN(MINT_AMOUNT),
    })

    // Move the block time into the future so the contract is expired
    await time.increase(twoDays + 1)

    // Bob should fail to close after expiration date
    await expectRevert(
      deployedMarket.closePosition(MINT_AMOUNT, { from: bobAccount }),
      ERROR_MESSAGES.CANNOT_CLOSE_EXPIRED,
    )

    // wToken and bToken should be burned
    assert.equal(
      await wToken.balanceOf.call(aliceAccount),
      0,
      "wToken should be burned",
    )
    assert.equal(
      await bToken.balanceOf.call(aliceAccount),
      0,
      "bToken should be burned",
    )

    // Alice should have her original collateral back
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      MINT_AMOUNT,
      "alice should end up with collateral after closing",
    )
  })

  it("Sets restricted minter", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    // Price ratio will be 10k base units of usdc per wbtc
    const priceRatio = new BN(10000).mul(new BN(10).pow(new BN(18)))

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      priceRatio,
      expiration,
      0, // 0 fees
      0, // 0 fees
      0, // 0 fees
      tokenLogic.address,
    )

    // Give Alice 100 collateral tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // approve the amount and mint alice some options
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })
    await deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount })

    // Set the restricted minter
    const ret = await deployedMarket.updateRestrictedMinter(carolAccount)
    expectEvent(ret, "RestrictedMinterUpdated", {
      newRestrictedMinter: carolAccount,
    })

    // Should fail to mint now
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })
    await expectRevert(
      deployedMarket.mintOptions(MINT_AMOUNT, { from: aliceAccount }),
      ERROR_MESSAGES.NON_MINTER,
    )
  })
})
