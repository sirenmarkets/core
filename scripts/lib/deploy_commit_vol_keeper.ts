import * as hre from "hardhat"

const ADDRESSES_PROVIDER = process.env.ADDRESSES_PROVIDER

export async function deploy_commit_vol_keeper(): Promise<any> {
  const AutomaticClaimVolKeeper = await hre.ethers.getContractFactory(
    "AutomaticClaimVolKeeper",
  )

  const automaticClaimVolKeeper = await AutomaticClaimVolKeeper.deploy(
    ADDRESSES_PROVIDER,
  )

  await automaticClaimVolKeeper.deployed()
  console.log(
    "AutomaticClaimVolKeeper deployed to:       ",
    automaticClaimVolKeeper.address.toLowerCase(),
  )

  console.log("[*] Verifying...")
  console.log("[*] Waiting 1 min before continuing...")
  await sleep(61000)
  await verifyContract(automaticClaimVolKeeper.address, "PriceOracleKeeper", [
    ADDRESSES_PROVIDER,
  ])

  return {
    automaticClaimVolKeeper,
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
