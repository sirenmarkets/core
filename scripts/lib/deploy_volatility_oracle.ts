import * as hre from "hardhat"

const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

export async function deployVolatilityOracle(
  priceOracle: string,
  gnosisAddress: string,
  dateOffset: number,
): Promise<any> {
  gnosisAddress = gnosisAddress.toLowerCase()

  const [signer] = await hre.ethers.getSigners()
  const deployerAddress = signer.address.toLowerCase()

  console.log(`deployer address is: ${deployerAddress}`)

  if (dateOffset !== WEEK_DURATION && dateOffset !== DAY_DURATION) {
    throw new Error("date offset must be either 1 week or 1 day")
  }

  const VolatilityOracleFactory = await hre.ethers.getContractFactory(
    "VolatilityOracle",
  )
  console.log("DAYDURATION", DAY_DURATION)
  console.log("PORICE ORACLE", priceOracle)
  console.log("WINDOW_SIZE", WINDOW_SIZE)
  const volatilityOracle = await VolatilityOracleFactory.deploy(
    DAY_DURATION,
    priceOracle,
    WINDOW_SIZE,
  )

  await volatilityOracle.deployed()
  console.log(
    "Volatility Oracle deployed to:       ",
    volatilityOracle.address.toLowerCase(),
  )

  return {
    volatilityOracle,
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
