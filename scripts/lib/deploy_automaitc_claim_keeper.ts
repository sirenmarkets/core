import * as hre from "hardhat"
const { request, gql } = require("graphql-request")

const V2_SUBGRAPH_URL = process.env.V2_SUBGRAPH_URL

export async function deploy_automatic_claim_keeper(): Promise<any> {
  const V2_CONTRACTS_QUERY = gql`
    query {
      amms {
        id
      }
    }
  `

  let { amms } = await request(V2_SUBGRAPH_URL, V2_CONTRACTS_QUERY)
  // we remove keys and get addresses only
  amms = amms.map((x) => x.id)

  console.log("[*] Amm found:")
  amms.map((x) => console.log(x))
  console.log()

  const AutomaticClaimKeeper = await hre.ethers.getContractFactory(
    "AutomaticClaimKeeper",
  )

  const automaticTokenKepper = await AutomaticClaimKeeper.deploy(amms)

  await automaticTokenKepper.deployed()
  console.log(
    "AutomaticClaimKeeper deployed to:       ",
    automaticTokenKepper.address.toLowerCase(),
  )

  console.log("[*] Verifying...")
  console.log("[*] Waiting 1 min before continuing...")
  await sleep(61000)
  await verifyContract(automaticTokenKepper.address, "AutomaticClaimKeeper", [
    amms,
  ])

  return {
    automaticTokenKepper,
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
  console.log(`[*] verified the ${contractName}`)
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
