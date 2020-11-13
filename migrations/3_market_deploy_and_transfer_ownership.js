const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")

/**
 * Deploy Market logic contract
 */
module.exports = async function (deployer, network, accounts) {
  deployer.then(async () => {
    console.log(`Deploying Market logic contract`)

    const marketImpl = await deployer.deploy(Market)
    const tokenImpl = await SimpleToken.deployed()
    // we need initialize the contract with null values and transfer ownership
    // to an invalid address, so that there is no chance of someone
    // destructing the contract parity wallet style
    // (see https://www.parity.io/a-postmortem-on-the-parity-multi-sig-library-self-destruct/)
    const BURN_ADDRESS = "0x000000000000000000000000000000000000dead"
    await marketImpl.initialize(
      "",
      tokenImpl.address,
      tokenImpl.address,
      0,
      0,
      0,
      0,
      0,
      0,
      tokenImpl.address,
    )
    await marketImpl.transferOwnership(BURN_ADDRESS)

    console.log("completed Market logic contract deploy")
  })
}
