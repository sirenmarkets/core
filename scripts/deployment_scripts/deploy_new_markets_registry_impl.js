const MarketsRegistry = artifacts.require("MarketsRegistry")

async function run() {
  console.log(`Deploying new MarketsRegistry impl`)

  // deploy the new Market impl
  console.log("deploying new MarketsRegistry contract")
  const newMarketsRegistryImpl = await MarketsRegistry.new()
  console.log(
    `created MarketsRegistry impl at address ${newMarketsRegistryImpl.address}`,
  )

  // we need initialize the contract with null values and transfer ownership
  // to an invalid address, so that there is no chance of someone
  // destructing the contract parity wallet style
  // (see https://www.parity.io/a-postmortem-on-the-parity-multi-sig-library-self-destruct/)
  console.log("initializing new MarketsRegistry contract")
  const BURN_ADDRESS = "0x000000000000000000000000000000000000dead"
  const res = await newMarketsRegistryImpl.initialize(
    BURN_ADDRESS,
    BURN_ADDRESS,
    BURN_ADDRESS,
  )

  console.log(`initialized new MarketsRegistry impl with tx id: ${res.tx}`)

  console.log("transferring ownership to burner address")
  await newMarketsRegistryImpl.transferOwnership(BURN_ADDRESS)

  console.log("completed deploying new MarketsRegistry impl")
}

module.exports = async (callback) => {
  try {
    await run()
    callback()
  } catch (e) {
    callback(e)
  }
}
