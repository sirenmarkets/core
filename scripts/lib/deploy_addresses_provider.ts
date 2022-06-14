import * as hre from "hardhat"
const { request, gql } = require("graphql-request")

const V2_SUBGRAPH_URL = process.env.V2_SUBGRAPH_URL
const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

export async function deployAddressesProvider() {
  const AddressesProvider = await hre.ethers.getContractFactory(
    "AddressesProvider",
  )
  // now deploy all the contracts. Later we will initialize them in the correct order
  const addressesProviderLogic = await AddressesProvider.deploy()
  await addressesProviderLogic.deployed()
  // const addressesProviderProxy = await Proxy.deploy(
  //   addressesProviderLogic.address,
  // )
  // await addressesProviderProxy.deployed()
  console.log(
    "Logic AddressesProviderLogic deployed to: ",
    addressesProviderLogic.address.toLowerCase(),
  )
  // const addressesProvider = AddressesProvider.attach(
  //   addressesProviderProxy.address,
  // )
  // console.log(
  //   "AddressesProvider deployed to:       ",
  //   addressesProvider.address.toLowerCase(),
  // )
  100000000
  return {}
}
