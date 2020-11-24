const RewardsDistribution = artifacts.require("RewardsDistribution")
const StakingRewards = artifacts.require("StakingRewards")
const VestingVault = artifacts.require("VestingVault")
const SirenToken = artifacts.require("SirenToken")
const SimpleToken = artifacts.require("SimpleToken")

const { delay, getNetworkName } = require("../utils")

const ONE_MINUTE_IN_SECS = 60

/**
 * Deploy staking-related contracts, as well as the vesting contracts, and transfer their ownership
 * to the appropriate admin wallet depending on the network we're deploying on
 */
async function run() {
  const accounts = await web3.eth.getAccounts()
  const deployer = accounts[0]
  const network = await getNetworkName(await web3.eth.net.getId())

  console.log(`Deploying staking and vesting contracts`)

  // first set all the appropriate contract instances based on the network
  let wbtcLPToken
  let usdcLPToken
  let sirenToken
  let multisigAddress
  let vestingStartTimeInSecs
  let llpDurationInDays
  if (network === "development") {
    multisigAddress = deployer // in development we skip the multisig and make the deployer account the owner of everything

    // we have no automated way of getting these addresses from the scripts/markets/create_markets.js
    // script, so you'll need to update these manually after running
    // `npm run deploy-local | grep "uses lpToken"` to see what the lpToken address values are
    wbtcLPToken = await SimpleToken.at(
      "0xf511dDD4A54939DB527cB97eca215359C4f70c7e",
    )
    usdcLPToken = await SimpleToken.at(
      "0x8ab955A082Dac1B8808c150c1D2C842A4ba7072E",
    )

    // create a new SirenToken
    console.log("deploying SirenToken...")
    sirenToken = await SirenToken.new(multisigAddress)
    console.log(
      `successfully deployed SirenToken with tx ${sirenToken.transactionHash} at address ${sirenToken.address}`,
    )

    // start 1 minute ahead of now. We start a little bit ahead of now to ensure that the
    // startTime is somewhat later than the current blocktime (see VestingVault constructor)
    vestingStartTimeInSecs =
      Math.round(new Date().getTime() / 1000) + ONE_MINUTE_IN_SECS
    llpDurationInDays = 84 // lpp lasts 84 days (6 rounds with of 2 weeks each)
  } else if (network === "rinkeby") {
    multisigAddress = "0xCbb845969EcB2f89f2a736c785eB27F0B5B52410"

    // these 2 contracts will need to change if our rinkeby AMMs ever get redeployed
    wbtcLPToken = await SimpleToken.at(
      "0xefae1235f737f1e6b3dc9d6f2bcda57509ed1d9f",
    )
    usdcLPToken = await SimpleToken.at(
      "0x43f329bd242c11998365eda046ca7d8b2a73b7c3",
    )

    // create a new SirenToken
    console.log("deploying SirenToken...")
    sirenToken = await SirenToken.new(multisigAddress)
    console.log(
      `successfully deployed SirenToken with tx ${sirenToken.transactionHash} at address ${sirenToken.address}`,
    )

    // start 1 minute ahead of now. We start a little bit ahead of now to ensure that the
    // startTime is somewhat later than the current blocktime (see VestingVault constructor)
    vestingStartTimeInSecs =
      Math.round(new Date().getTime() / 1000) + ONE_MINUTE_IN_SECS

    llpDurationInDays = 84 // lpp lasts 84 days (6 rounds with of 2 weeks each)
  } else if (network === "mainnet") {
    multisigAddress = "0xd42dfEB13BDAe6120B99730cB8e5DEa18004A44b"

    // these 2 contracts will need to change if our rinkeby AMMs ever get redeployed
    wbtcLPToken = await SimpleToken.at(
      "0x079a4ae617af07bc2f7820e565eff90401a915ba",
    )
    usdcLPToken = await SimpleToken.at(
      "0x98e64bee2ba4a45b75f4614a734cc9d4ba0ee26c",
    )

    sirenToken = await SirenToken.at(
      "0xD23Ac27148aF6A2f339BD82D0e3CFF380b5093de",
    )

    // TODO
    vestingStartTimeInSecs = 0
    if (vestingStartTimeInSecs === 0) {
      throw new Error("TODO: must determine mainnet vesting start date")
    }

    llpDurationInDays = 84 // lpp lasts 84 days (6 rounds with of 2 weeks each)
  }

  console.log("deploying RewardsDistribution...")
  const rewardsDistribution = await RewardsDistribution.new(
    multisigAddress,
    multisigAddress,
    sirenToken.address,
    multisigAddress,
  )
  console.log(
    `successfully deployed RewardsDistribution with tx ${rewardsDistribution.transactionHash} at address ${rewardsDistribution.address}`,
  )

  console.log("deploying VestingVault...")
  const vestingVault = await VestingVault.new(
    sirenToken.address,
    vestingStartTimeInSecs,
    llpDurationInDays,
    0,
  )
  console.log(
    `successfully deployed VestingVault with tx ${vestingVault.transactionHash} at address ${vestingVault.address}`,
  )

  console.log("deploying WBTC StakingRewards...")
  let stakingRewards = await StakingRewards.new(
    multisigAddress,
    rewardsDistribution.address,
    sirenToken.address,
    wbtcLPToken.address,
    vestingVault.address,
  )
  console.log(
    `successfully deployed WBTC StakingRewards with tx ${stakingRewards.transactionHash} at address ${stakingRewards.address}`,
  )

  console.log("deploying USDC StakingRewards...")
  stakingRewards = await StakingRewards.new(
    multisigAddress,
    rewardsDistribution.address,
    sirenToken.address,
    usdcLPToken.address,
    vestingVault.address,
  )
  console.log(
    `successfully deployed USDC StakingRewards with tx ${stakingRewards.transactionHash} at address ${stakingRewards.address}`,
  )

  console.log("completed deploy of staking and vesting contracts")
}

module.exports = async (callback) => {
  try {
    await run()
    callback()
  } catch (e) {
    callback(e)
  }
}
