const SirenToken = artifacts.require("SirenToken")
const Timelock = artifacts.require("Timelock")
const GovernorAlpha = artifacts.require("GovernorAlpha")

// TODO make this an functioning truffle script
module.exports = async function (deployer, network, accounts) {
  deployer.then(async () => {
    // Deploy the governance token and give all tokens to account 0
    const token = await deployer.deploy(SirenToken, accounts[0])
    // Deploy the timelock with account 0 as initial admin, and 3 day delay (blocks are ~15 seconds)
    const timeLock = await deployer.deploy(Timelock, accounts[0], 172800)
    // Deploy the governance module that will allow token holders to vote on proposed actions to take
    // Timelock, token, and account 0 as the guardian
    const governance = await deployer.deploy(
      GovernorAlpha,
      timeLock.address,
      token.address,
      accounts[0],
      17280,
    )

    console.log("completed governance migration")
  })
}
