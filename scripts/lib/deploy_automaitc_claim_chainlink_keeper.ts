import * as hre from "hardhat"
const { request, gql } = require("graphql-request")

const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

const V2_SUBGRAPH_URL = process.env.V2_SUBGRAPH_URL

export async function deploy_automatic_claim_keeper(): Promise<any> {
  const V2_CONTRACTS_QUERY = gql`
    query {
      amms {
        id
      }
      seriesControllers {
        id
        priceOracle
      }
      erc1155Controllers {
        id
      }
      seriesVaults {
        id
      }
      oracleSettings {
        priceOracleAddress
      }
    }
  `

  const { amms } = await request(V2_SUBGRAPH_URL, V2_CONTRACTS_QUERY)

  const ExpiredTokensKeeper = await hre.ethers.getContractFactory(
    "ExpiredTokensKeeper",
  )

  const expiredTokenKeeper = await ExpiredTokensKeeper.deploy(amms)

  await expiredTokenKeeper.deployed()
  console.log(
    "Volatility Oracle deployed to:       ",
    expiredTokenKeeper.address.toLowerCase(),
  )

  return {
    expiredTokenKeeper,
  }
}

const verifyContract = async (
  address,
  contractName,
  constructorArguments = [],
) => {
  await hre.run("verify:verify", {
    address,
    constructorArguments,
  })
  console.log(`verified the ${contractName}`)
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
