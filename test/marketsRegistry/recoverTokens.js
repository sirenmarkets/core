/* global artifacts contract it assert */
const {
  expectRevert,
  time,
  expectEvent,
  BN,
} = require("@openzeppelin/test-helpers")
const { MarketStyle } = require("../util")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const MinterAmm = artifacts.require("MinterAmm")
const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")
const Proxy = artifacts.require("Proxy")
const TestHelpers = require("../testHelpers")

contract("Create Markets", (accounts) => {
  const bn = (input) => web3.utils.toBN(input)
  const assertBNequal = (bnOne, bnTwo) =>
    assert.equal(bnOne.toString(), bnTwo.toString())

  const ownerAccount = accounts[0]
  const lv1Account = accounts[1]
  const lv2Account = accounts[2]
  const user = accounts[3]
  const secondaryAccount = accounts[4]

  const vaultPercentage = bn("70")

  const BURN_ADDRESS = "0x000000000000000000000000000000000000dead"
  const baseUnit = bn("1000000000000000000")
  const TOKENS_MINT = bn("1000000").mul(baseUnit)
  const TOKENS_AMOUNT = bn("10000").mul(baseUnit)

  let ammLogic
  let marketLogic
  let tokenLogic
  let marketsRegistryLogic
  let deployedMarketsRegistry

  let collateralToken
  let paymentToken

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    tokenLogic = await SimpleToken.new()
    marketsRegistryLogic = await MarketsRegistry.new()
    marketLogic = await Market.new()
    ammLogic = await MinterAmm.new()

    // Create a collateral token
    collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BNB", "WBNB", 18)
    await collateralToken.mint(ownerAccount, TOKENS_MINT)

    // Create a payment token
    paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 18)
    await paymentToken.mint(ownerAccount, TOKENS_MINT)

    await marketsRegistryLogic.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )
    await marketsRegistryLogic.transferOwnership(BURN_ADDRESS)
  })

  beforeEach(async () => {
    // Create a new proxy contract pointing at the marketsRegistry logic for testing
    const proxyContract = await Proxy.new(marketsRegistryLogic.address)
    deployedMarketsRegistry = await MarketsRegistry.at(proxyContract.address)
    await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )
  })

  it("Sets lv accounts as authorized LiquidVaults", async () => {
    await deployedMarketsRegistry.addFeeReceiver(
      lv1Account,
      secondaryAccount,
      vaultPercentage,
    )
    await deployedMarketsRegistry.addFeeReceiver(
      lv2Account,
      secondaryAccount,
      vaultPercentage,
    )

    const {
      authorized: authorized1,
    } = await deployedMarketsRegistry.feeReceivers(lv1Account)
    const {
      authorized: authorized2,
    } = await deployedMarketsRegistry.feeReceivers(lv2Account)
    assert.isTrue(authorized1)
    assert.isTrue(authorized2)
  })

  it("Reverts addFeeReceiver() from non-owner", async () => {
    await expectRevert(
      deployedMarketsRegistry.addFeeReceiver(
        lv1Account,
        secondaryAccount,
        vaultPercentage,
        { from: lv1Account },
      ),
      "Ownable: caller is not the owner.",
    )
  })

  it("Reverts if unauthorized liquid vault is trying to recover tokens", async () => {
    await collateralToken.transfer(
      deployedMarketsRegistry.address,
      TOKENS_AMOUNT,
    )
    assertBNequal(
      await collateralToken.balanceOf(deployedMarketsRegistry.address),
      TOKENS_AMOUNT,
    )

    await expectRevert(
      deployedMarketsRegistry.recoverTokens(
        collateralToken.address,
        ownerAccount,
        { from: user },
      ),
      "Sender address must be an authorized receiver or an owner",
    )
  })

  it("Recovers tokens for an authorized LV", async () => {
    await collateralToken.transfer(
      deployedMarketsRegistry.address,
      TOKENS_AMOUNT,
    )
    assertBNequal(
      await collateralToken.balanceOf(deployedMarketsRegistry.address),
      TOKENS_AMOUNT,
    )

    await deployedMarketsRegistry.addFeeReceiver(
      lv1Account,
      secondaryAccount,
      vaultPercentage,
    )
    deployedMarketsRegistry.recoverTokens(collateralToken.address, lv1Account, {
      from: lv1Account,
    })

    const expectedTokenAmount = TOKENS_AMOUNT.mul(vaultPercentage).div(
      bn("100"),
    )
    assertBNequal(
      await collateralToken.balanceOf(lv1Account),
      expectedTokenAmount,
    )
  })
})
