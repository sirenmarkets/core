import * as hre from "hardhat"

const ADDRESSES_PROVIDER = process.env.ADDRESSES_PROVIDER

export async function deploy_commit_vol_keeper(): Promise<any> {
  const VolatilityOracleKeeper = await hre.ethers.getContractFactory(
    "VolatilityOracleKeeper",
  )

  const volatilityOracleKeeper = await VolatilityOracleKeeper.deploy(
    ADDRESSES_PROVIDER,
  )

  await volatilityOracleKeeper.deployed()
  console.log(
    "VolatilityOracleKeeper deployed to:       ",
    volatilityOracleKeeper.address.toLowerCase(),
  )

  console.log("[*] Verifying...")
  console.log("[*] Waiting 1 min before continuing...")
  await sleep(61000)
  await verifyContract(volatilityOracleKeeper.address, "PriceOracleKeeper", [
    ADDRESSES_PROVIDER,
  ])

  return {
    volatilityOracleKeeper,
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
