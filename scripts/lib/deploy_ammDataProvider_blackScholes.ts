import * as hre from "hardhat"
import { SeriesControllerInstance } from "../../typechain"
const { request, gql } = require("graphql-request")

const V2_SUBGRAPH_URL = process.env.V2_SUBGRAPH_URL
const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

export async function deploySingletonContracts(): Promise<any> {
  const [signer] = await hre.ethers.getSigners()
  const deployerAddress = signer.address.toLowerCase()

  console.log(`deployer address is: ${deployerAddress}`)

  const AmmDataProvider = await hre.ethers.getContractFactory("AmmDataProvider")

  // let seriesControllerAddress = "0x716C543b39a85aac0240Ba7Ed07e79f06e1FEd48"
  let seriesControllerAddress = "0x1e89959a55097b3c49dba04738bda09e2539676b"
  // let erc1155Address = "0x509fe9c9712f9a895a9adbf2f96bad09abf79988"
  let erc1155Address = "0x2957401b956374a4428c301e16bc3d69716ea15c"
  // let addressesProviderAddress = "0xeca3e062a073daff795bdae97c14d602931d4233"
  let addressesProviderAddress = "0x264c7e8fdd91acfaefafd3da677e7d7881795d2a"
  const ammDataProvider = await AmmDataProvider.deploy(
    seriesControllerAddress, //0xc854c563b7406725d8f37858dc7ca033ceeebf2b
    erc1155Address, //0x985c831f719114eb7e6779608c601bacb3326753
    addressesProviderAddress,
  )
  console.log(
    "AmmDataProvider deployed to:         ",
    ammDataProvider.address.toLowerCase(),
  )

  const BlackScholes = await hre.ethers.getContractFactory("BlackScholes")
  const blackScholesLogic = await BlackScholes.deploy()
  await blackScholesLogic.deployed()
  console.log(
    "Logic BlackScholes deployed to:         ",
    blackScholesLogic.address.toLowerCase(),
  )

  return {
    ammDataProvider,
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
