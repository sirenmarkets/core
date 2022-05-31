import * as hre from "hardhat"

const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

export async function deploySeriesDeployer(
  addressesProvider: string,
): Promise<any> {
  const Proxy = await hre.ethers.getContractFactory("Proxy")

  const SeriesDeployer = await hre.ethers.getContractFactory("SeriesDeployer")
  const SeriesDeployerLogic = await SeriesDeployer.deploy()
  await SeriesDeployerLogic.deployed()

  const seriesDeployerProxy = await Proxy.deploy(SeriesDeployerLogic.address)
  await seriesDeployerProxy.deployed()

  console.log(
    "Logic SeriesDeployerLogic deployed to:       ",
    SeriesDeployerLogic.address.toLowerCase(),
  )

  const seriesDeployer = SeriesDeployer.attach(seriesDeployerProxy.address)
  console.log(
    "VolatilityOracle deployed to:             ",
    seriesDeployer.address.toLowerCase(),
  )

  seriesDeployer.initialize(addressesProvider)

  return {
    seriesDeployer,
  }
}
