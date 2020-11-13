const { time, BN } = require("@openzeppelin/test-helpers")
const { MarketStyle } = require("../util")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MinterAmm = artifacts.require("MinterAmm")
const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")
const Proxy = artifacts.require("Proxy")
const TestHelpers = require("../testHelpers")

const NAME = "WBTC.USDC.20300101.50000"
const FAKE_COLLATERAL_TOKEN = "0x456d84BE25A0a940887b8E0E9e6Ab1A77DB8Fc65"
const FAKE_PAYMENT_TOKEN = "0xaB23928A2f6C62E0A08D4402946bfD79bBb22AfE"
const STRIKE_RATIO = 50000
const EXPIRATION = 1893456000

const REDEEM_FEE = 1
const CLOSE_FEE = 2
const CLAIM_FEE = 3

const STATE_OPEN = 0
const STATE_EXPIRED = 1

// A number of seconds we'll use in each of the tests to fast forward to prior to expiry.
// This gives us enough leeway so that the tests can complete before the time is after
// the expiration date, in which case the options can no longer be exercised
const SECONDS_TO_EXPIRY = 10

/**
 * Testing the flows for the Market Contract
 */
contract("Market Fees", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const carolAccount = accounts[3]

  let deployedMarket
  let registry

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    const registryLogic = await MarketsRegistry.deployed()

    tokenLogic = await SimpleToken.deployed()
    marketLogic = await Market.deployed()
    const ammLogic = await MinterAmm.deployed()

    const proxyContract = await Proxy.new(registryLogic.address)
    registry = await MarketsRegistry.at(proxyContract.address)
    await registry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )
  })

  it("Sends fees to the owner account", async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)

    // Amount we will be minting
    const MINT_AMOUNT = 10000

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Mint bob the amount of tokens he needs
    await paymentToken.mint(bobAccount, MINT_AMOUNT * 10000)

    // Give Carol collateral that she will close
    await collateralToken.mint(carolAccount, MINT_AMOUNT)

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    // Price ratio will be 10k base units of usdc per wbtc
    const priceRatio = new BN(10000).mul(new BN(10).pow(new BN(18)))

    await registry.createMarket(
      NAME,
      collateralToken.address,
      paymentToken.address,
      MarketStyle.EUROPEAN_STYLE,
      priceRatio,
      expiration,
      10, // redeem
      20, // close
      30, // claim
      TestHelpers.ADDRESS_ZERO,
    )

    const deployedMarketAddress = await registry.markets.call(NAME)
    deployedMarket = await Market.at(deployedMarketAddress)

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

    const bobCollateralAmount = MINT_AMOUNT / 2
    const bobPaymentAmount = (MINT_AMOUNT * 10000) / 2

    // Move time ahead so we're within the exercise window
    await time.increase(twoDays - SECONDS_TO_EXPIRY)

    // Only redeem half
    await deployedMarket.exerciseOption(bobCollateralAmount, {
      from: bobAccount,
    })

    // Bob should have paid 0.1% to redeem
    const bobCollateralFee = bobCollateralAmount * 0.001
    assert.equal(
      (await collateralToken.balanceOf.call(bobAccount)).toNumber(),
      bobCollateralAmount - bobCollateralFee,
      "bob should end up with half of collateral minus fee",
    )

    // Carol will mint and close
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {
      from: carolAccount,
    })
    await deployedMarket.mintOptions(MINT_AMOUNT, { from: carolAccount })
    await deployedMarket.closePosition(MINT_AMOUNT, { from: carolAccount })

    // Carols accounts hould have mint amount minus fee
    const collateralFeeForCarol = MINT_AMOUNT * 0.002
    assert.equal(
      (await collateralToken.balanceOf.call(carolAccount)).toNumber(),
      MINT_AMOUNT - collateralFeeForCarol,
      "carol should have had fees deducted",
    )

    // Move the block time into the future so the contract is expired
    await time.increase(twoDays + 1)

    // Should succeed from Alice
    await deployedMarket.claimCollateral(MINT_AMOUNT, { from: aliceAccount })

    // Alice and Bob should have split the collateral and payments and have fees subtracted
    const aliceLeftoverCollateral = MINT_AMOUNT / 2
    const alicePaymentAmount = (MINT_AMOUNT * 10000) / 2

    // Alice should have spent 0.3% in fees to claimn collateral
    const aliceClaimCollateralFee = aliceLeftoverCollateral * 0.003
    const aliceClaimPaymentFee = alicePaymentAmount * 0.003

    // Alice should have her claim of collateral and payment minus fees
    assert.equal(
      (await collateralToken.balanceOf.call(aliceAccount)).toNumber(),
      aliceLeftoverCollateral - aliceClaimCollateralFee,
      "alice should end up with half of collateral minus fees",
    )
    assert.equal(
      (await paymentToken.balanceOf.call(aliceAccount)).toNumber(),
      alicePaymentAmount - aliceClaimPaymentFee,
      "alice should end up with half of payment minus fees",
    )

    // Owner account should end up with all fees collected
    assert.equal(
      (await collateralToken.balanceOf.call(registry.address)).toNumber(),
      collateralFeeForCarol + bobCollateralFee + aliceClaimCollateralFee,
      "owner should have collateral fees added",
    )
    assert.equal(
      (await paymentToken.balanceOf.call(registry.address)).toNumber(),
      aliceClaimPaymentFee,
      "owner should have payment fees added",
    )
  })
})
