import { deploySeriesDeployer } from "./lib/deploy_series_deployer"
import { argumentError } from "./lib/helper"

const ADDRESSES_PROVIDER = process.env.ADDRESSES_PROVIDER

async function main() {
  await deploySeriesDeployer(ADDRESSES_PROVIDER)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
