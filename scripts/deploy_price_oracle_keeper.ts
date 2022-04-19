import { deploy_price_oracle_keeper } from "./lib/deploy_price_oracle_keeper"

async function main() {
  await deploy_price_oracle_keeper()
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
