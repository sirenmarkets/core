import { deploy_automatic_claim_keeper } from "./lib/deploy_automaitc_claim_keeper"

async function main() {
  await deploy_automatic_claim_keeper()
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
