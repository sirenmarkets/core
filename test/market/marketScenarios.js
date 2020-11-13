const { time, BN } = require("@openzeppelin/test-helpers")
const { MarketStyle } = require("../util")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MinterAmm = artifacts.require("MinterAmm")
const LPToken = artifacts.require("LPToken")
const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")

const NAME = "WBTC.USDC.20300101.20000"

// A number of seconds we'll use in each of the tests to fast forward to prior to expiry.
// This gives us enough leeway so that the tests can complete before the time is after
// the expiration date, in which case the options can no longer be exercised
const SECONDS_TO_EXPIRY = 100

/**
 * Testing the flows for the Market Contract
 */
contract("Market Scenarios", (accounts) => {
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  let tokenLogic

  before(async () => {
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    tokenLogic = await SimpleToken.new()
  })

  // Do a covered call - lock up bitcoin at a specific price and claim with USDC
  it("Calculates call option decimals for wBTC and USDC at $20k strike", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // Amount we will be minting equals 1 BTC - 100,000,000
    const wBTCDecimals = 8
    const MINT_AMOUNT = new BN(10).pow(new BN(wBTCDecimals))
    // console.log({MINT_AMOUNT: MINT_AMOUNT.toString()})

    // Amount will be 20k USDC - 200,000,000
    const USDCDecimals = 4
    const PAYMENT_AMOUNT = new BN(20000).mul(
      new BN(10).pow(new BN(USDCDecimals)),
    )
    // console.log({PAYMENT_AMOUNT: PAYMENT_AMOUNT.toString()})

    // 10^18 ratio is 1, so multiple the price ratio by that number
    const STRIKE = PAYMENT_AMOUNT.div(MINT_AMOUNT).mul(
      new BN(10).pow(new BN(18)),
    )

    // Give Alice the collateral
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Give BOB the payment
    await paymentToken.mint(bobAccount, PAYMENT_AMOUNT)

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    const deployedMarket = await Market.new()
    await deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE,
      expiration,
      0,
      0,
      0,
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

    // Bob redeems all of the options
    await paymentToken.approve(deployedMarket.address, PAYMENT_AMOUNT, {
      from: bobAccount,
    })

    // Move the block time into the future so the option can be redeemed
    await time.increase(twoDays - SECONDS_TO_EXPIRY)

    await deployedMarket.exerciseOption(MINT_AMOUNT, { from: bobAccount })

    // Move the block time into the future so the contract is expired
    await time.increase(twoDays + 1)

    // Alice claims her payment with wToken
    await deployedMarket.claimCollateral(MINT_AMOUNT, { from: aliceAccount })

    // Alice should have all payment
    assert.equal(
      (await paymentToken.balanceOf.call(aliceAccount)).toNumber(),
      PAYMENT_AMOUNT,
      "alice should end up with all paymnt",
    )

    // Bob should end up with all collateral
    assert.equal(
      (await collateralToken.balanceOf.call(bobAccount)).toNumber(),
      MINT_AMOUNT,
      "bob should have all collateral",
    )
  })

  // Do a covered put - lock up USDC at a specific price and claim with wBTC
  it("Calculates put option decimals for USDC and wBTC at $12k strike", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // Amount we will be minting equals 1 BTC - 100,000,000
    const wBTCDecimals = 8
    const MINT_AMOUNT = new BN(10).pow(new BN(wBTCDecimals))
    // console.log({MINT_AMOUNT: MINT_AMOUNT.toString()})

    // Amount will be $12k USDC - 120,000,000
    const USDCDecimals = 4
    const PAYMENT_AMOUNT = new BN(12000).mul(
      new BN(10).pow(new BN(USDCDecimals)),
    )
    // console.log({PAYMENT_AMOUNT: PAYMENT_AMOUNT.toString()})

    // 10^18 ratio is 1, so multiply the price ratio by that number - 833,333,333,333,333,333 (less than 1)
    const STRIKE = MINT_AMOUNT.mul(new BN(10).pow(new BN(18))).div(
      PAYMENT_AMOUNT,
    )
    // console.log({STRIKE: STRIKE.toString()})

    // Give Alice the collateral
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Give BOB the payment
    await paymentToken.mint(bobAccount, PAYMENT_AMOUNT)

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    const deployedMarket = await Market.new()
    await deployedMarket.initialize(
      `${NAME}2`,
      paymentToken.address,
      collateralToken.address,
      MarketStyle.EUROPEAN_STYLE,
      STRIKE,
      expiration,
      0,
      0,
      0,
      tokenLogic.address,
    )

    // Save off the tokens
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())

    // Bob mints options by locking up USDC
    await paymentToken.approve(deployedMarket.address, PAYMENT_AMOUNT, {
      from: bobAccount,
    })
    await deployedMarket.mintOptions(PAYMENT_AMOUNT, { from: bobAccount })

    assert.equal(
      (await bToken.balanceOf.call(bobAccount)).toNumber(),
      PAYMENT_AMOUNT,
      "bob should have b Token",
    )
    assert.equal(
      (await wToken.balanceOf.call(bobAccount)).toNumber(),
      PAYMENT_AMOUNT,
      "bob should have w Token",
    )
    assert.equal(
      (await paymentToken.balanceOf.call(bobAccount)).toNumber(),
      0,
      "bob should have no USDC",
    )

    // Send the bTokens from bob to alice
    await bToken.transfer(aliceAccount, PAYMENT_AMOUNT, { from: bobAccount })
    assert.equal(
      (await bToken.balanceOf.call(aliceAccount)).toNumber(),
      PAYMENT_AMOUNT,
      "alice should have all b Token",
    )

    // Alice redeems all of the options by sending in wBTC
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: aliceAccount,
    })

    // Move the block time into the future so the option can be redeemed
    await time.increase(twoDays - SECONDS_TO_EXPIRY)

    await deployedMarket.exerciseOption(PAYMENT_AMOUNT, { from: aliceAccount })

    assert.equal(
      (await bToken.balanceOf.call(aliceAccount)).toNumber(),
      0,
      "alice should have no b Token",
    )

    // In this case, it is actually rounded, so techically she has 1 base unit left over
    assert.equal(
      (await collateralToken.balanceOf.call(aliceAccount)).toNumber(),
      1,
      "alice should have no wBTC",
    )

    // Move the block time into the future so the contract is expired
    await time.increase(twoDays + 1)

    // Bob claims his payment with wToken
    await deployedMarket.claimCollateral(PAYMENT_AMOUNT, { from: bobAccount })

    // Bob should have all payment
    assert.equal(
      (await paymentToken.balanceOf.call(aliceAccount)).toNumber(),
      PAYMENT_AMOUNT,
      "alice should end up with all usdc",
    )
    assert.equal(
      (await paymentToken.balanceOf.call(bobAccount)).toNumber(),
      0,
      "bob should not have any usdc",
    )

    // Alice should end up with all wbtc - technically it rounded... so she has 1 base unit
    assert.equal(
      (await collateralToken.balanceOf.call(aliceAccount)).toNumber(),
      1,
      "alice should not have any wbtc",
    )
    assert.equal(
      (await collateralToken.balanceOf.call(bobAccount)).toNumber(),
      MINT_AMOUNT.toNumber() - 1,
      "bob should have all wbtc",
    )
  })
})
