import * as hre from "hardhat"

const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

export async function deployVolatilityOracle(): Promise<any> {
  const VolatilityOracle = await hre.ethers.getContractFactory(
    "VolatilityOracle",
  )
  const volatilityOracleLogic = await VolatilityOracle.deploy()
  await volatilityOracleLogic.deployed()

  console.log(
    "Logic VolatilityOracle deployed to:       ",
    volatilityOracleLogic.address.toLowerCase(),
  )

  return {
    volatilityOracleLogic,
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
