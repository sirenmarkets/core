/* global artifacts contract it assert */
const {
  expectRevert,
  time,
  expectEvent,
  BN,
} = require("@openzeppelin/test-helpers")
const { MarketStyle } = require("../util")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")
const Proxy = artifacts.require("Proxy")
const SirenToken = artifacts.require("SirenToken")
const Timelock = artifacts.require("Timelock")
const GovernorAlpha = artifacts.require("GovernorAlpha")
const MinterAmm = artifacts.require("MinterAmm")
const VestingTokenDistribution = artifacts.require("VestingTokenDistribution")
const VestingVault = artifacts.require("VestingVault")

const TestHelpers = require("../testHelpers")

const NAME = "WBTC.USDC.20300101.50000"
const STRIKE_RATIO = 50000
const EXPIRATION = 1893456000
const VOTE_PERIOD_BLOCKS = 5

/**
 * Testing the flows for the Market Contract
 */
contract("Vesting Governance Verification", (accounts) => {
  let marketLogic
  let tokenLogic
  let marketsRegistryLogic
  let deployedMarketsRegistry
  let collateralToken
  let paymentToken

  before(async () => {
    // These logic contracts are what the proxy contracts will point to
    tokenLogic = await SimpleToken.deployed()
    marketLogic = await Market.deployed()
    marketsRegistryLogic = await MarketsRegistry.deployed()
    const proxyContract = await Proxy.new(marketsRegistryLogic.address)
    deployedMarketsRegistry = await MarketsRegistry.at(proxyContract.address)

    const ammLogic = await MinterAmm.deployed()
    await deployedMarketsRegistry.initialize(
      tokenLogic.address,
      marketLogic.address,
      ammLogic.address,
    )

    // Create a collateral token
    collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    // Create a payment token
    paymentToken = await SimpleToken.new()
    await paymentToken.initialize("USD Coin", "USDC", 6)
  })

  it("Initializes governance and creates a market with vesting vault", async () => {
    const twoDays = 60 * 60 * 24 * 2

    // Deploy governance
    // Deploy the governance token
    const sirenToken = await SirenToken.new(accounts[0])

    let currentTime = await time.latest()

    // Create a Token Distribution
    const distributionContract = await VestingTokenDistribution.new(
      sirenToken.address,
      currentTime.add(new BN(twoDays)),
      10, // 10 day vest
      0, // 0 day cliff
    )

    // Tokens to send - 5 million
    const tokensToDistribute = new BN(5_000_000).mul(new BN(10).pow(new BN(18)))

    // Add account 1 as recipient
    await distributionContract.addRecipients(
      [accounts[1]],
      [tokensToDistribute],
    )

    // Send tokens to distribution contract
    await sirenToken.transfer(distributionContract.address, tokensToDistribute)

    // Trigger the distribution
    const createdRet = await distributionContract.distribute(1)
    const vestingVault = await VestingVault.at(createdRet.logs[0].args.vault)

    // Deploy the timelock with account 0 as initial admin, and 2 day delay
    const timeLock = await Timelock.new(accounts[0], twoDays)

    // Deploy the governance module that will allow token holders to vote on proposed actions to take
    // Timelock, token, and account 0 as the guardian
    const governance = await GovernorAlpha.new(
      timeLock.address,
      sirenToken.address,
      accounts[0],
      VOTE_PERIOD_BLOCKS,
    )

    // Hand governance of the timelock over to the token holders
    // First, we need to get the payload to trigger setPendingAdmin
    let callData = timeLock.contract.methods
      .setPendingAdmin(governance.address)
      .encodeABI()

    // Get the ETA for 2 days from now
    currentTime = await time.latest()
    let eta = currentTime.add(new BN(twoDays + 1))

    // Next, submit it to the timelock
    await timeLock.queueTransaction(timeLock.address, 0, "", callData, eta)

    // Wait 2 days + 60 seconds
    await time.increaseTo(eta.add(new BN(60)))

    // Execute the pending transaction that hands admin rights to the governance module (sets as pending)
    await timeLock.executeTransaction(timeLock.address, 0, "", callData, eta)

    // Trigger acceptance of ownership from the governance contract
    await governance.__acceptAdmin()

    // At this point governance has been handed over to the governance module... hand ownership of the market registry over to the timelocker
    await deployedMarketsRegistry.transferOwnership(timeLock.address)

    const balanceOf = await sirenToken.balanceOf(accounts[1])
    const currentVotes = await sirenToken.getCurrentVotes(accounts[1])
    const getPriorVotes = await sirenToken.getPriorVotes(
      accounts[1],
      (await time.latestBlock()) - 1,
    )
    // console.log({balanceOf, currentVotes, getPriorVotes})

    // Now let's do a governance vote to create a market... first create a proposal from account 1
    callData = deployedMarketsRegistry.contract.methods
      .createMarket(
        NAME,
        collateralToken.address,
        paymentToken.address,
        MarketStyle.EUROPEAN_STYLE,
        STRIKE_RATIO,
        EXPIRATION,
        0,
        0,
        0,
        TestHelpers.ADDRESS_ZERO,
      )
      .encodeABI()
    await governance.propose(
      [deployedMarketsRegistry.address],
      [0],
      [""],
      [callData],
      "Create new market",
      { from: accounts[1] },
    )

    // Let a few blocks pass so we can vote
    await time.advanceBlock()
    await time.advanceBlock()

    // Now let's vote
    await governance.castVote(1, true, { from: accounts[1] })

    // Let 2 days pass for voting
    const p = await governance.proposals.call(1)
    await time.advanceBlockTo(p.endBlock)

    // Queue the proposal
    await governance.queue(1)

    // Wait for the timelock period to pass
    currentTime = await time.latest()
    eta = currentTime.add(new BN(twoDays + 1))
    await time.increaseTo(eta.add(new BN(60)))

    // Execute it
    const ret = await governance.execute(1)
    expectEvent.inLogs(ret.logs, "ProposalExecuted", { id: "1" })

    // Verify the market exists
    const deployedMarketAddress = await deployedMarketsRegistry.markets.call(
      NAME,
    )
    const newMarket = await Market.at(deployedMarketAddress)
    assert.equal(
      await newMarket.marketName.call(),
      NAME,
      "New market should be deployed with name",
    )

    // Fast forward 10 days to end of vesting
    await time.increaseTo(currentTime.add(new BN(twoDays * 5)))
    vestingVault.claimVestedTokens(accounts[1])
    const lastBalance = await sirenToken.balanceOf.call(accounts[1])
    assert.equal(
      lastBalance.toString(),
      tokensToDistribute.toString(),
      "Bob should have tokens",
    )
  })
})
