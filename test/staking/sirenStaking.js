/* global artifacts contract it assert */
const { time, expectEvent, BN } = require("@openzeppelin/test-helpers")
const SimpleToken = artifacts.require("SimpleToken")
const SirenToken = artifacts.require("SirenToken")
const RewardsDistribution = artifacts.require("RewardsDistribution")
const StakingRewards = artifacts.require("StakingRewards")
const VestingVault = artifacts.require("VestingVault")

const { checkBNsWithinTolerance } = require("../util")
const TestHelpers = require("../testHelpers")

/**
 * Testing the flows for LPP Staking
 */
contract("Staking Verification", (accounts) => {
  let lpToken // the staking token
  let sirenToken // the rewards token
  let rewardsDist
  let stakingRewards
  let vestingVault

  // used when creating a StakingRewards, this doesn't actually
  // get used by the contract, only emitted in the constructor
  // event so that the subgraph mapping has access to it
  const fauxAmmAddress = TestHelpers.ADDRESS_ZERO

  // this user can update parameters of the RewardsDistribution and and call
  // StakingRewards.setRewardsDuration
  const owner = accounts[1]

  // this user can call RewardsDistribution.distributeRewards
  const authority = accounts[2]

  // this user creates SI and funds the staking system with the SI
  const siHolder = accounts[3]

  // these users will be minted LP token and stake it for SI rewards
  const aliceStaker = accounts[4]
  const bobStaker = accounts[5]

  const ALICE_STAKE_AMOUNT = new BN(1000).mul(new BN(10).pow(new BN(8)))
  const BOB_STAKE_AMOUNT = new BN(2000).mul(new BN(10).pow(new BN(8)))

  const ONE_DAY = 60 * 60 * 24
  const TWO_WEEKS = 14 * ONE_DAY
  const exp = new BN(10).pow(new BN(18)) // 10 ** 18
  const BLOCK_INTERVAL_SECS = 15

  // 1% of all SI
  const TOTAL_SI_TO_BE_DISTRIBUTED = new BN(1_000_000).mul(exp)

  beforeEach(async () => {
    lpToken = await SimpleToken.new()
    await lpToken.initialize("LP-WBTC-USD", "LP-WBTC-USD", 8)
    await lpToken.mint(aliceStaker, ALICE_STAKE_AMOUNT)
    await lpToken.mint(bobStaker, BOB_STAKE_AMOUNT)

    // owner will have 100_000_000e18 SI once the SirenToken is created
    sirenToken = await SirenToken.new(siHolder, { from: siHolder })

    rewardsDist = await RewardsDistribution.new(
      owner,
      authority,
      sirenToken.address,
      siHolder,
    )
  })

  describe("no vesting", async () => {
    // these tests shorten the vesting schedule to as short a time as possible so it can focus on the staking
    // and reward logic

    it("should distribute SI token correctly with all stakers joining prior to reward distribution", async () => {
      // first setup the vesting and staking contracts

      const startTime = Number(await time.latest()) + (TWO_WEEKS - ONE_DAY)
      vestingVault = await VestingVault.new(sirenToken.address, startTime, 1, 0)

      stakingRewards = await StakingRewards.new(
        owner,
        rewardsDist.address,
        fauxAmmAddress,
        sirenToken.address,
        lpToken.address,
        vestingVault.address,
      )

      // then set a rewards distribution duration

      let ret = await stakingRewards.setRewardsDuration(TWO_WEEKS, {
        from: owner,
      })
      expectEvent(ret, "RewardsDurationUpdated")

      // now add the total amount of SI we're going to give away across all the rounds

      await sirenToken.transfer(
        rewardsDist.address,
        TOTAL_SI_TO_BE_DISTRIBUTED,
        {
          from: siHolder,
        },
      )

      assert.equal(
        (await sirenToken.balanceOf.call(rewardsDist.address)).toString(),
        TOTAL_SI_TO_BE_DISTRIBUTED.toString(),
        "RewardsDistribution should have SI token",
      )

      // now have the LP's stake their coin

      // stakers should have 0 reward prior to staking
      let aliceRewardAmount = await stakingRewards.rewards.call(aliceStaker)
      assert.equal(aliceRewardAmount, "0", "alice's reward is not correct")
      let bobRewardAmount = await stakingRewards.rewards.call(bobStaker)
      assert.equal(bobRewardAmount, "0", "bob's reward is not correct")

      await lpToken.approve(stakingRewards.address, ALICE_STAKE_AMOUNT, {
        from: aliceStaker,
      })
      ret = await stakingRewards.stake(ALICE_STAKE_AMOUNT, {
        from: aliceStaker,
      })
      expectEvent(ret, "Staked", {
        user: aliceStaker,
        amount: ALICE_STAKE_AMOUNT.toString(),
      })

      await lpToken.approve(stakingRewards.address, BOB_STAKE_AMOUNT, {
        from: bobStaker,
      })
      ret = await stakingRewards.stake(BOB_STAKE_AMOUNT, { from: bobStaker })
      expectEvent(ret, "Staked", {
        user: bobStaker,
        amount: BOB_STAKE_AMOUNT.toString(),
      })

      // now add a SI reward

      const firstRoundAmount = new BN(10_000).mul(exp)
      ret = await rewardsDist.addRewardDistribution(
        stakingRewards.address,
        firstRoundAmount,
        { from: owner },
      )
      expectEvent(ret, "RewardDistributionAdded", {
        index: "0",
        destination: stakingRewards.address,
        amount: firstRoundAmount.toString(),
      })

      // now begin the rewards distribution period

      assert.equal(
        await stakingRewards.periodFinish.call(),
        "0",
        "periodFinish should be 0",
      )

      ret = await rewardsDist.distributeRewards(firstRoundAmount, {
        from: authority,
      })

      assert.equal(
        (await sirenToken.balanceOf.call(stakingRewards.address)).toString(),
        firstRoundAmount.toString(),
        "first round of SI should have been sent to StakingRewards contract",
      )

      // now have the stakers exit their position and get their staking + reward coin

      await time.increase(TWO_WEEKS + 1)

      // alice put in 1000, bob put in 2000, and they were the only stakers, so the total stakes
      // is 3000. So alice should get 1/3 of the firstRoundAmount
      const aliceExpectedReward = firstRoundAmount.mul(new BN(1)).div(new BN(3))
      await stakingRewards.exit({ from: aliceStaker })
      await vestingVault.claimVestedTokens(aliceStaker)
      const aliceActualReward = await sirenToken.balanceOf.call(aliceStaker)
      const tolerance = new BN(1).mul(new BN(10).pow(new BN(6)))
      checkBNsWithinTolerance(
        aliceExpectedReward,
        aliceActualReward,
        tolerance,
        "alice should have received the correct amount of reward coin",
      )

      // and bob should get 2/3 of the firstRoundAmount
      const bobExpectedReward = firstRoundAmount.mul(new BN(2)).div(new BN(3))
      await stakingRewards.exit({ from: bobStaker })
      await vestingVault.claimVestedTokens(bobStaker)
      const bobActualReward = await sirenToken.balanceOf.call(bobStaker)
      checkBNsWithinTolerance(
        bobExpectedReward,
        bobActualReward,
        tolerance,
        "bob should have received the correct amount of reward coin",
      )

      // check that whatever is left over in the StakingRewards is dust amount
      assert(
        (await sirenToken.balanceOf.call(stakingRewards.address)).lte(
          tolerance,
        ),
      )
    })

    it("should distribute SI token correctly with 1 staker joining after reward distribution", async () => {
      // first setup the vesting and staking contracts

      const startTime = Number(await time.latest()) + (TWO_WEEKS - ONE_DAY)
      vestingVault = await VestingVault.new(sirenToken.address, startTime, 1, 0)

      stakingRewards = await StakingRewards.new(
        owner,
        rewardsDist.address,
        fauxAmmAddress,
        sirenToken.address,
        lpToken.address,
        vestingVault.address,
      )

      // then set a rewards distribution duration

      let ret = await stakingRewards.setRewardsDuration(TWO_WEEKS, {
        from: owner,
      })
      expectEvent(ret, "RewardsDurationUpdated")

      // now add the total amount of SI we're going to give away across all the rounds

      await sirenToken.transfer(
        rewardsDist.address,
        TOTAL_SI_TO_BE_DISTRIBUTED,
        {
          from: siHolder,
        },
      )

      assert.equal(
        (await sirenToken.balanceOf.call(rewardsDist.address)).toString(),
        TOTAL_SI_TO_BE_DISTRIBUTED.toString(),
        "RewardsDistribution should have SI token",
      )

      // now have the alice stake her coin, bob will stake after reward distribution

      // stakers should have 0 reward prior to staking
      let aliceRewardAmount = await stakingRewards.rewards.call(aliceStaker)
      assert.equal(aliceRewardAmount, "0", "alice's reward is not correct")
      let bobRewardAmount = await stakingRewards.rewards.call(bobStaker)
      assert.equal(bobRewardAmount, "0", "bob's reward is not correct")

      await lpToken.approve(stakingRewards.address, ALICE_STAKE_AMOUNT, {
        from: aliceStaker,
      })
      ret = await stakingRewards.stake(ALICE_STAKE_AMOUNT, {
        from: aliceStaker,
      })
      expectEvent(ret, "Staked", {
        user: aliceStaker,
        amount: ALICE_STAKE_AMOUNT.toString(),
      })

      // now add a SI reward

      const firstRoundAmount = new BN(10_000).mul(exp)
      ret = await rewardsDist.addRewardDistribution(
        stakingRewards.address,
        firstRoundAmount,
        { from: owner },
      )
      expectEvent(ret, "RewardDistributionAdded", {
        index: "0",
        destination: stakingRewards.address,
        amount: firstRoundAmount.toString(),
      })

      // now begin the rewards distribution period

      assert.equal(
        await stakingRewards.periodFinish.call(),
        "0",
        "periodFinish should be 0",
      )

      ret = await rewardsDist.distributeRewards(firstRoundAmount, {
        from: authority,
      })

      assert.equal(
        (await sirenToken.balanceOf.call(stakingRewards.address)).toString(),
        firstRoundAmount.toString(),
        "first round of SI should have been sent to StakingRewards contract",
      )

      // now increase to halfway through the distribution period and add another staker

      await time.increase(TWO_WEEKS / 2)

      await lpToken.approve(stakingRewards.address, BOB_STAKE_AMOUNT, {
        from: bobStaker,
      })
      ret = await stakingRewards.stake(BOB_STAKE_AMOUNT, { from: bobStaker })
      expectEvent(ret, "Staked", {
        user: bobStaker,
        amount: BOB_STAKE_AMOUNT.toString(),
      })

      // now fast forward to the end of the staking period

      await time.increase(TWO_WEEKS / 2 + 1)

      // alice put in 1000 at the beginning, bob put in 0, and they were the only stakers.
      // When bob joins in 1/2-way through the distribution period, since alice was the only
      // staker she makes half of the first round amount in reward token (10_000 / 2 = 5000).
      // When bob joins he puts in 2000, and both alice and bob hold their staked amounts
      // until the end of the distribution period. Since for the latter half of the period
      // there are 5000 coins available for rewards (remember, the other 5000 all went to alice)
      // then alice gets 5000 * (1000 / (1000 + 2000)) = 1666.6666, and bob gets
      // 5000 * (2000 / (1000 + 2000)) = 3333.33333. So together alice gets 5000 + 1666.6666
      // which equals 2/3's of the firstRoundAmount, and bob gets 3333.33333 which is 1/3 of the
      // first round amount

      const aliceExpectedReward = firstRoundAmount.mul(new BN(2)).div(new BN(3))
      await stakingRewards.exit({ from: aliceStaker })
      await vestingVault.claimVestedTokens(aliceStaker)
      const aliceActualReward = await sirenToken.balanceOf.call(aliceStaker)
      const tolerance = new BN(1).mul(new BN(10).pow(new BN(8)))
      checkBNsWithinTolerance(
        aliceExpectedReward,
        aliceActualReward,
        tolerance,
        "alice should have received the correct amount of reward coin",
      )

      const bobExpectedReward = firstRoundAmount.mul(new BN(1)).div(new BN(3))
      await stakingRewards.exit({ from: bobStaker })
      await vestingVault.claimVestedTokens(bobStaker)
      const bobActualReward = await sirenToken.balanceOf.call(bobStaker)
      checkBNsWithinTolerance(
        bobExpectedReward,
        bobActualReward,
        tolerance,
        "bob should have received the correct amount of reward coin",
      )

      // check that whatever is left over in the StakingRewards is dust amount
      assert(
        (await sirenToken.balanceOf.call(stakingRewards.address)).lte(
          tolerance,
        ),
      )
    })
  })
})
