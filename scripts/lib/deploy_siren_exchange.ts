import * as hre from "hardhat"
const { request, gql } = require("graphql-request")

const V2_SUBGRAPH_URL = process.env.V2_SUBGRAPH_URL
const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

export async function deploySirenExchange(addressesProvider: string) {
  const SirenExchangeFactory = await hre.ethers.getContractFactory(
    "SirenExchange",
  )

  const sirenExchange = await SirenExchangeFactory.deploy(addressesProvider)

  await sirenExchange.deployed()
  console.log(
    "SirenExchange deployed to:       ",
    sirenExchange.address.toLowerCase(),
  )

  return {}
}
