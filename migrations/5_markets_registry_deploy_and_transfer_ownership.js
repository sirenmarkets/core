const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")
const MarketsRegistry = artifacts.require("MarketsRegistry")

/**
 * Deploy MarketsRegistry logic contract
 */
module.exports = async function (deployer, network, accounts) {
  if (network === "development") {
    return
  }

  deployer.then(async () => {
    console.log(`Deploying MarketsRegistry logic contract`)

    const marketsRegistry = await deployer.deploy(MarketsRegistry)

    const tokenImpl = await SimpleToken.deployed()
    const marketImpl = await Market.deployed()
    const ammImpl = await MinterAmm.deployed()

    // we need initialize the contract with null values and transfer ownership
    // to an invalid address, so that there is no chance of someone
    // destructing the contract parity wallet style
    // (see https://www.parity.io/a-postmortem-on-the-parity-multi-sig-library-self-destruct/)
    const BURN_ADDRESS = "0x000000000000000000000000000000000000dead"
    await marketsRegistry.initialize(
      tokenImpl.address,
      marketImpl.address,
      ammImpl.address,
    )
    await marketsRegistry.transferOwnership(BURN_ADDRESS)

    console.log("completed MarketsRegistry logic contract deploy")
  })
}
