/* global artifacts contract it assert */
import { time, expectEvent, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract, assert } from "hardhat"
import {
  GovernorAlphaContract,
  GovernorAlphaInstance,
  SeriesControllerInstance,
  SimpleTokenInstance,
  SirenTokenContract,
  TimelockContract,
} from "../../typechain"

const GovernorAlpha: GovernorAlphaContract = artifacts.require("GovernorAlpha")
const SirenToken: SirenTokenContract = artifacts.require("SirenToken")
const Timelock: TimelockContract = artifacts.require("Timelock")

import {
  getSeriesName,
  setupAllTestContracts,
  ONE_WEEK_DURATION,
} from "../util"

import TestHelpers from "../testHelpers"

const STRIKE_PRICE = 50000e8
const VOTE_PERIOD_BLOCKS = 5
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

/**
 * Testing the flows for the Series Contract
 */
contract("Governance Verification", (accounts) => {
  const deployer = accounts[0]

  let deployedSeriesController: SeriesControllerInstance

  let underlyingToken: SimpleTokenInstance
  let priceToken: SimpleTokenInstance
  let collateralToken: SimpleTokenInstance

  let expiration: number

  before(async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      expiration,
    } = await setupAllTestContracts({
      oraclePrice: BTC_ORACLE_PRICE,
      strikePrice: STRIKE_PRICE.toString(),
      skipCreateSeries: true,
    }))

    await time.increaseTo(expiration - ONE_WEEK_DURATION)
  })

  it("Initializes governance and creates a series", async () => {
    const twoDays = 60 * 60 * 24 * 2

    // Deploy governance
    // Deploy the governance token and delegate all votes to account 1
    const sirenToken = await SirenToken.new(accounts[0])
    await sirenToken.delegate(accounts[1])

    // Deploy the timelock with account 0 as initial admin, and 2 day delay
    const timeLock = await Timelock.new(accounts[0], twoDays)

    // Deploy the governance module that will allow token holders to vote on proposed actions to take
    // Timelock, token, and account 0 as the guardian
    const governance: GovernorAlphaInstance = await GovernorAlpha.new(
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
    let currentTime = await time.latest()
    let eta = currentTime.add(new BN(twoDays + 1))

    // Next, submit it to the timelock
    await timeLock.queueTransaction(timeLock.address, 0, "", callData, eta)

    // Wait 2 days + 60 seconds
    await time.increaseTo(eta.add(new BN(60)))

    // Execute the pending transaction that hands admin rights to the governance module (sets as pending)
    await timeLock.executeTransaction(timeLock.address, 0, "", callData, eta)

    // Trigger acceptance of ownership from the governance contract
    await governance.__acceptAdmin()

    // At this point governance has been handed over to the governance module... hand ownership of the series registry over to the timelocker
    await deployedSeriesController.transferOwnership(timeLock.address)

    // make sure the ownership was correctly transferred
    const adminRole = await deployedSeriesController.DEFAULT_ADMIN_ROLE()
    assert(!(await deployedSeriesController.hasRole(adminRole, deployer)))
    assert(await deployedSeriesController.hasRole(adminRole, timeLock.address))

    // const balanceOf = await sirenToken.balanceOf(accounts[1])
    // const currentVotes = await sirenToken.getCurrentVotes(accounts[1])
    // const getPriorVotes = await sirenToken.getPriorVotes(
    //   accounts[1],
    //   (await time.latestBlock()) - 1,
    // )
    // console.log({balanceOf, currentVotes, getPriorVotes})

    // Now let's do a governance vote to create a series... first create a proposal from account 1
    callData = deployedSeriesController.contract.methods
      .createSeries(
        {
          underlyingToken: underlyingToken.address,
          priceToken: priceToken.address,
          collateralToken: collateralToken.address,
        },
        [STRIKE_PRICE],
        [expiration],
        [TestHelpers.ADDRESS_ZERO],
        false,
      )
      .encodeABI()
    await governance.propose(
      [deployedSeriesController.address],
      [0],
      [""],
      [callData],
      "Create new series",
      { from: accounts[1] },
    )

    // Let a few blocks pass so we can vote
    await time.advanceBlock()
    await time.advanceBlock()

    // Now let's vote
    await governance.castVote(1, true, { from: accounts[1] })

    // Let 2 days pass for voting
    const p = await governance.proposals(1)
    await time.advanceBlockTo(p[4]) // endBlock

    // Queue the proposal
    await governance.queue(1)

    // Wait for the timelock period to pass
    currentTime = await time.latest()
    eta = currentTime.add(new BN(twoDays + 1))
    await time.increaseTo(eta.add(new BN(60)))

    // Execute it
    const ret = await governance.execute(1)
    expectEvent(ret, "ProposalExecuted", { id: "1" })

    // Verify the series exists
    const seriesName = await getSeriesName(
      underlyingToken,
      priceToken,
      collateralToken,
      STRIKE_PRICE,
      expiration,
      false,
    )

    const seriesId = 0

    assert.equal(
      await deployedSeriesController.seriesName(seriesId),
      seriesName,
      "New series should be deployed with name",
    )
  })
})
