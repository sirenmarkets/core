const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")
const IERC20 = artifacts.require("IERC20")

const { getNetworkName } = require("../utils")

async function run() {
  const network = await getNetworkName(await web3.eth.net.getId())

  console.log(`Deploying new Market impl`)

  let tokenImpl
  let anotherTokenImpl
  if (network === "mainnet") {
    console.log("connecting to token impl 1")
    // this was previously deployed on mainnet, and can be used anywhere
    // a SimpleToken implementation contract is needed
    tokenImpl = await SimpleToken.at(
      "0x9de76539de34f3ae31f69bb713125dd53ba8d3ba",
    )

    console.log("connecting to token impl 2")
    // this was previously deployed on mainnet, and can be used anywhere
    // a SimpleToken implementation contract is needed
    anotherTokenImpl = await SimpleToken.at(
      "0xe7BB1866db7d736b625cDf27e383f41486185FA9",
    )
  } else if (network === "rinkeby") {
    console.log("connecting to WBTC token")
    tokenImpl = await IERC20.at("0x78d255da735b254f5573cfd1e0c0244ecf5c4441") // current WBTC on rink

    console.log("connecting to USDC token")
    anotherTokenImpl = await IERC20.at(
      "0x7048c766c16c8ed9b8b4664e6da18197c9125e41",
    ) // current USDC on rink
  } else if (network === "development") {
    tokenImpl = await SimpleToken.deployed()
    anotherTokenImpl = await SimpleToken.new()
  } else {
    throw new Error(`No configuration for network ${network}`)
  }

  // deploy the new Market impl
  console.log("deploying new Market contract")
  const newMarketImpl = await Market.new()
  console.log(`created Market impl at address ${newMarketImpl.address}`)

  // we need initialize the contract with null values and transfer ownership
  // to an invalid address, so that there is no chance of someone
  // destructing the contract parity wallet style
  // (see https://www.parity.io/a-postmortem-on-the-parity-multi-sig-library-self-destruct/)
  console.log("initializing new Market contract")
  const BURN_ADDRESS = "0x000000000000000000000000000000000000dead"
  const res = await newMarketImpl.initialize(
    "BURN_ADDRESS",
    tokenImpl.address,
    anotherTokenImpl.address,
    0,
    1,
    3610512000,
    0,
    0,
    0,
    tokenImpl.address,
  )

  console.log(`initialized new Market impl with tx id: ${res.tx}`)

  console.log("transferring ownership to burner address")
  await newMarketImpl.transferOwnership(BURN_ADDRESS)

  console.log("completed deploying new Market impl")
}

module.exports = async (callback) => {
  try {
    await run()
    callback()
  } catch (e) {
    callback(e)
  }
}
