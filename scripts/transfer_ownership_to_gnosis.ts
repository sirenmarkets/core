import * as hre from "hardhat"
const { request, gql } = require("graphql-request")

import { argumentError } from "./lib/helper"

const V2_SUBGRAPH_URL = process.env.V2_SUBGRAPH_URL
if (V2_SUBGRAPH_URL == null || V2_SUBGRAPH_URL == "") {
  argumentError("V2_SUBGRAPH_URL")
}

const AMM_FACTORY_ADDRESS = process.env.AMM_FACTORY_ADDRESS
if (AMM_FACTORY_ADDRESS == null || AMM_FACTORY_ADDRESS == "") {
  argumentError("AMM_FACTORY_ADDRESS")
}

const GNOSIS_ADDRESS = process.env.GNOSIS_ADDRESS
if (GNOSIS_ADDRESS == null || GNOSIS_ADDRESS == "") {
  argumentError("GNOSIS_ADDRESS")
}

const V2_CONTRACTS_QUERY = gql`
  query {
    amms {
      id
    }
    seriesControllers {
      id
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

// transfer all contracts originally deployed and owned by a deployer address, to the Gnosis Safe multisig
async function main() {
  // get all the contracts we'll need
  const ERC1155Controller = await hre.ethers.getContractFactory(
    "ERC1155Controller",
  )
  const SeriesVault = await hre.ethers.getContractFactory("SeriesVault")
  const SeriesController = await hre.ethers.getContractFactory(
    "SeriesController",
  )
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle")
  const MinterAmm = await hre.ethers.getContractFactory("MinterAmm")
  const AmmFactory = await hre.ethers.getContractFactory("AmmFactory")

  const {
    amms,
    seriesControllers,
    erc1155Controllers,
    seriesVaults,
    oracleSettings,
  } = await request(V2_SUBGRAPH_URL, V2_CONTRACTS_QUERY)

  const seriesController = seriesControllers[0].id
  const seriesControllerContract = SeriesController.attach(seriesController)

  const erc1155Controller = erc1155Controllers[0].id
  const erc1155ControllerContract = ERC1155Controller.attach(erc1155Controller)

  const seriesVault = seriesVaults[0].id
  const seriesVaultContract = SeriesVault.attach(seriesVault)

  const priceOracle = oracleSettings[0].priceOracleAddress
  const priceOracleContract = PriceOracle.attach(priceOracle)

  const AmmFactoryContract = AmmFactory.attach(AMM_FACTORY_ADDRESS)

  console.log(`transferring all contract ownership to: ${GNOSIS_ADDRESS}`)

  // first transfer all of the singleton contracts
  ;(await seriesControllerContract.transferOwnership(GNOSIS_ADDRESS)).wait()
  console.log(`finished transferring SeriesController: ${seriesController}`)
  ;(await erc1155ControllerContract.transferOwnership(GNOSIS_ADDRESS)).wait()
  console.log(`finished transferring ERC1155Controller: ${erc1155Controller}`)
  ;(await seriesVaultContract.transferOwnership(GNOSIS_ADDRESS)).wait()
  console.log(`finished transferring SeriesVault: ${seriesVault}`)
  ;(await priceOracleContract.transferOwnership(GNOSIS_ADDRESS)).wait()
  console.log(`finished transferring PriceOracle: ${priceOracle}`)
  ;(await AmmFactoryContract.transferOwnership(GNOSIS_ADDRESS)).wait()
  console.log(`finished transferring AmmFactory: ${AMM_FACTORY_ADDRESS}`)

  // now, transfer the AMMs

  for (const amm of amms) {
    const ammAddress = amm.id
    const MinterAmmContract = MinterAmm.attach(ammAddress)
    ;(await MinterAmmContract.transferOwnership(GNOSIS_ADDRESS)).wait()
    console.log(`finished transferring AMM: ${ammAddress}`)
  }

  console.log("transfer complete")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
