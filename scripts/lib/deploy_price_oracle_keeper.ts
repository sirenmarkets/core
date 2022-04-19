import * as hre from "hardhat"

const ADDRESSES_PROVIDER = process.env.ADDRESSES_PROVIDER

export async function deploy_price_oracle_keeper(): Promise<any> {
  const PriceOracleKeeper = await hre.ethers.getContractFactory(
    "PriceOracleKeeper",
  )

  const priceOracleKeeper = await PriceOracleKeeper.deploy(ADDRESSES_PROVIDER)

  await priceOracleKeeper.deployed()
  console.log(
    "PriceOracleKeeper deployed to:       ",
    priceOracleKeeper.address.toLowerCase(),
  )

  console.log("[*] Verifying...")
  console.log("[*] Waiting 1 min before continuing...")
  await sleep(61000)
  await verifyContract(priceOracleKeeper.address, "PriceOracleKeeper", [
    ADDRESSES_PROVIDER,
  ])

  return {
    priceOracleKeeper,
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
