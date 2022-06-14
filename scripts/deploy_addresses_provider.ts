import { deployAddressesProvider } from "./lib/deploy_addresses_provider"

async function main() {
  await deployAddressesProvider()
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
