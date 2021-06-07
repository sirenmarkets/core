const SimpleToken = artifacts.require("SimpleToken")

/**
 * Deploy SimpleToken logic contract
 */
module.exports = async function (deployer, network, accounts) {
  deployer.then(async () => {
    if (network === "development") {
      return
    }

    console.log(`Deploying SimpleToken logic contract`)

    const tokenImpl = await deployer.deploy(SimpleToken)

    // we need initialize the contract with null values and transfer ownership
    // to an invalid address, so that there is no chance of someone
    // destructing the contract parity wallet style
    // (see https://www.parity.io/a-postmortem-on-the-parity-multi-sig-library-self-destruct/)
    await tokenImpl.initialize("", "", 0)

    const deployerAddress = accounts[0]
    const DEFAULT_ADMIN_ROLE = web3.utils.hexToBytes("0x00")
    const BURN_ADDRESS = "0x000000000000000000000000000000000000dead"
    await tokenImpl.grantRole(DEFAULT_ADMIN_ROLE, BURN_ADDRESS)
    await tokenImpl.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddress)

    console.log("completed SimpleToken logic contract deploy")
  })
}
