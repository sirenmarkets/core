const Market = artifacts.require("Market")
const SimpleToken = artifacts.require("SimpleToken")
const MinterAmm = artifacts.require("MinterAmm")
const AggregatorV3Interface = artifacts.require("AggregatorV3Interface")
const MockPriceOracle = artifacts.require("MockPriceOracle")

/**
 * Deploy MinterAmm logic contract
 */
module.exports = async function (deployer, network, accounts) {
  deployer.then(async () => {
    console.log(`Deploying MinterAmm logic contract`)

    const ammImpl = await deployer.deploy(MinterAmm)

    let priceOracle
    if (network === "mainnet") {
      console.log("connecting to mainnet oracle")
      // see https://etherscan.io/address/0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c
      priceOracle = await AggregatorV3Interface.at(
        "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
      )
    } else if (network === "kovan") {
      console.log("connecting to kovan oracle")
      // see https://kovan.etherscan.io/address/0x6135b13325bfC4B00278B4abC5e20bbce2D6580e
      priceOracle = await AggregatorV3Interface.at(
        "0x6135b13325bfC4B00278B4abC5e20bbce2D6580e",
      )
    } else if (network === "rinkeby") {
      console.log("connecting to rinkeby oracle")
      // https://rinkeby.etherscan.io/address/0xECe365B379E1dD183B20fc5f022230C044d51404
      priceOracle = await AggregatorV3Interface.at(
        "0xECe365B379E1dD183B20fc5f022230C044d51404",
      )
    } else if (network === "development") {
      console.log("deploying price oracle")
      priceOracle = await deployer.deploy(MockPriceOracle, 8)
      console.log("completed price oracle deploy")
    } else {
      throw new Error(`No configuration for network ${network}`)
    }

    const tokenImpl = await SimpleToken.deployed()
    const anotherTokenImpl = await SimpleToken.new()
    // we need initialize the contract with null values and transfer ownership
    // to an invalid address, so that there is no chance of someone
    // destructing the contract parity wallet style
    // (see https://www.parity.io/a-postmortem-on-the-parity-multi-sig-library-self-destruct/)
    const BURN_ADDRESS = "0x000000000000000000000000000000000000dead"
    await ammImpl.initialize(
      BURN_ADDRESS,
      priceOracle.address,
      tokenImpl.address,
      anotherTokenImpl.address,
      tokenImpl.address,
      0,
      false,
    )

    await ammImpl.transferOwnership(BURN_ADDRESS)

    console.log("completed MinterAmm logic contract deploy")
  })
}
