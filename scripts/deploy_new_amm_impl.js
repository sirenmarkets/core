const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")
const IERC20 = artifacts.require("IERC20")
const MinterAmm = artifacts.require("MinterAmm")
const MockPriceOracle = artifacts.require("MockPriceOracle")
const AggregatorV3Interface = artifacts.require("AggregatorV3Interface")

const { getNetworkName } = require("./utils")

async function run() {
  const network = await getNetworkName(await web3.eth.net.getId())

  console.log(`Deploying new AMM impl`)

  let priceOracle
  let tokenImpl
  let anotherTokenImpl
  if (network === "mainnet") {
    console.log("connecting to mainnet oracle")
    // see https://etherscan.io/address/0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c
    priceOracle = await AggregatorV3Interface.at(
      "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    )
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
    console.log("connecting to rinkeby oracle")
    // https://rinkeby.etherscan.io/address/0xECe365B379E1dD183B20fc5f022230C044d51404
    priceOracle = await AggregatorV3Interface.at(
      "0xECe365B379E1dD183B20fc5f022230C044d51404",
    )

    console.log("connecting to WBTC token")
    tokenImpl = await IERC20.at("0x78d255da735b254f5573cfd1e0c0244ecf5c4441") // current WBTC on rink

    console.log("connecting to USDC token")
    anotherTokenImpl = await IERC20.at(
      "0x7048c766c16c8ed9b8b4664e6da18197c9125e41",
    ) // current USDC on rink
  } else if (network === "development") {
    priceOracle = await MockPriceOracle.deployed()
    tokenImpl = await SimpleToken.deployed()
    anotherTokenImpl = await SimpleToken.new()
  } else {
    throw new Error(`No configuration for network ${network}`)
  }

  // deploy the new AMM impl
  console.log("deploying new AMM contract")
  const newAmmImpl = await MinterAmm.new()
  console.log(`created AMM impl at address ${newAmmImpl.address}`)

  // we need initialize the contract with null values and transfer ownership
  // to an invalid address, so that there is no chance of someone
  // destructing the contract parity wallet style
  // (see https://www.parity.io/a-postmortem-on-the-parity-multi-sig-library-self-destruct/)
  console.log("initializing new AMM contract")
  const BURN_ADDRESS = "0x000000000000000000000000000000000000dead"
  const res = await newAmmImpl.initialize(
    BURN_ADDRESS,
    priceOracle.address,
    tokenImpl.address,
    anotherTokenImpl.address,
    tokenImpl.address,
    0,
    false,
  )

  console.log(`initialized new AMM impl with tx id: ${res.tx}`)

  console.log("transferring ownership to burner address")
  await newAmmImpl.transferOwnership(BURN_ADDRESS)

  console.log("completed deploying new AMM impl")
}

module.exports = async (callback) => {
  try {
    await run()
    callback()
  } catch (e) {
    callback(e)
  }
}
