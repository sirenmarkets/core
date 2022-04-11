import * as hre from "hardhat"

const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

export async function deployVolatilityOracle(
  dateOffset: number,
  windowInDays: number,
  addressesProvider: string,
): Promise<any> {
  const [signer] = await hre.ethers.getSigners()
  const deployerAddress = signer.address.toLowerCase()

  console.log(`deployer address is: ${deployerAddress}`)

  if (dateOffset !== WEEK_DURATION && dateOffset !== DAY_DURATION) {
    throw new Error("date offset must be either 1 week or 1 day")
  }

  const Proxy = await hre.ethers.getContractFactory("Proxy")

  const VolatilityOracle = await hre.ethers.getContractFactory(
    "VolatilityOracle",
  )
  const volatilityOracleLogic = await VolatilityOracle.deploy()
  await volatilityOracleLogic.deployed()

  const volOracleProxy = await Proxy.deploy(volatilityOracleLogic.address)
  await volOracleProxy.deployed()
  console.log(
    "Logic VolatilityOracle deployed to:       ",
    volatilityOracleLogic.address.toLowerCase(),
  )
  const volatilityOracle = VolatilityOracle.attach(volOracleProxy.address)
  console.log(
    "VolatilityOracle deployed to:             ",
    volatilityOracle.address.toLowerCase(),
  )

  volatilityOracle.initialize(DAY_DURATION, addressesProvider, windowInDays)

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
