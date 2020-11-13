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
const FAKE_COLLATERAL_TOKEN = "0x456d84BE25A0a940887b8E0E9e6Ab1A77DB8Fc65"
const FAKE_PAYMENT_TOKEN = "0xaB23928A2f6C62E0A08D4402946bfD79bBb22AfE"
const STRIKE_RATIO = 50000
const EXPIRATION = 1893456000

const EXERCISE_FEE = 1
const CLOSE_FEE = 2
const CLAIM_FEE = 3

const STATE_OPEN = 0
const STATE_EXPIRED = 1

const ERROR_MESSAGES = {
  CANNOT_SWEEP_CLOSED: "ERC20s can't be recovered until the market is closed",
  CANNOT_DESTROY_CLOSED: "Markets can't be destroyed until it is closed",
}

/**
 * Testing the flows for the Market Contract
 */
contract("Market Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  let marketLogic
  let tokenLogic
  let deployedMarket

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    marketLogic = await Market.deployed()
    tokenLogic = await SimpleToken.deployed()
    ammLogic = { address: TestHelpers.ADDRESS_ZERO }
  })

  beforeEach(async () => {
    // Create a new proxy contract pointing at the market logic for testing
    const proxyContract = await Proxy.new(marketLogic.address)
    deployedMarket = await Market.at(proxyContract.address)
  })

  it("Can close out a market", async () => {
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

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24
    const oneHundredEightDays = (twoDays / 2) * 180

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
      10, // redeem
      20, // close
      30, // claim
      tokenLogic.address,
    )

    // Save off the tokens
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())

    // Mint some payment tokens to the market address
    await paymentToken.mint(deployedMarket.address, 250)

    // Prove that the owner can't sweep tokens or close it out while it is open
    await expectRevert(
      deployedMarket.recoverTokens(paymentToken.address),
      ERROR_MESSAGES.CANNOT_SWEEP_CLOSED,
    )
    await expectRevert(
      deployedMarket.selfDestructMarket(ownerAccount),
      ERROR_MESSAGES.CANNOT_DESTROY_CLOSED,
    )

    // Move the block time into the future so the contract is expired
    await time.increase(twoDays + 1)

    // Prove that the owner can't sweep tokens or close it out while it is expired
    await expectRevert(
      deployedMarket.recoverTokens(paymentToken.address),
      ERROR_MESSAGES.CANNOT_SWEEP_CLOSED,
    )
    await expectRevert(
      deployedMarket.selfDestructMarket(ownerAccount),
      ERROR_MESSAGES.CANNOT_DESTROY_CLOSED,
    )

    // Move 180 days so it is closed
    await time.increase(oneHundredEightDays)

    // Prove anyone can recover tokens
    let ret = await deployedMarket.recoverTokens(paymentToken.address)
    assert.equal(
      (await paymentToken.balanceOf.call(ownerAccount)).toString(),
      new BN(250).toString(),
      "recovered token should go to owner",
    )
    expectEvent.inLogs(ret.logs, "TokensRecovered", {
      token: paymentToken.address,
      to: ownerAccount,
      value: new BN(250),
    })

    // Prove non owner cannot destroy
    await expectRevert.unspecified(
      deployedMarket.selfDestructMarket(ownerAccount, { from: bobAccount }),
    )

    // Prove owner can destroy
    ret = await deployedMarket.selfDestructMarket(ownerAccount)
    expectEvent.inLogs(ret.logs, "MarketDestroyed")

    // Contract should be gone
    try {
      await deployedMarket.marketName.call()
      // Should not get here
      throw new Exception("Functions should fail to destroyed contract")
    } catch {}
  })
})
