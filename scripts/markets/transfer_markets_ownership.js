const { request, gql } = require("graphql-request")

const MarketsRegistry = artifacts.require("MarketsRegistry")
const MinterAmm = artifacts.require("MinterAmm")

const { getNetworkName } = require("../utils")

/**
 * Transfer ownership of MarketsRegistry and AMMs to admin multisig
 */
async function run() {
  const accounts = await web3.eth.getAccounts()
  const network = await getNetworkName(await web3.eth.net.getId())

  let subgraphUrl, multisigAddress, marketsRegistryAddress

  if (network == "rinkeby") {
    subgraphUrl =
      "https://api.thegraph.com/subgraphs/name/sirenmarkets/protocol-rinkeby"
    multisigAddress = "0xCbb845969EcB2f89f2a736c785eB27F0B5B52410"
    marketsRegistryAddress = "0x79E93476cac62E76fEA27A7f7F8f7ea73b4B764d"
  } else if (network == "mainnet") {
    subgraphUrl =
      "https://api.thegraph.com/subgraphs/name/sirenmarkets/protocol-mainnet"
    multisigAddress = "0xd42dfEB13BDAe6120B99730cB8e5DEa18004A44b"
    marketsRegistryAddress = "0xB8623477eA6f39B63598ceac4559728DCa81af63"
  } else {
    throw new Error(`No configuration for network ${network}`)
  }

  const queryResult = await request(subgraphUrl, CONTRACTS_QUERY)
  const { amms } = queryResult

  console.log("Transferring ownership on MarketsRegistry")
  const marketsRegistry = await MarketsRegistry.at(marketsRegistryAddress)
  await marketsRegistry.transferOwnership(multisigAddress)

  console.log("Transferring ownership on AMMs")
  await Promise.all(
    amms.map(async ({ id }) => {
      const amm = await MinterAmm.at(id)
      await amm.transferOwnership(multisigAddress)
    }),
  )

  console.log("Succesfully transferred ownership")
}

module.exports = async (callback) => {
  try {
    await run()
    callback()
  } catch (e) {
    callback(e)
  }
}

const CONTRACTS_QUERY = gql`
  {
    amms(first: 1000) {
      id
    }
  }
`
