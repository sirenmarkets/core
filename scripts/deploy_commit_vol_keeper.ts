import { deploy_commit_vol_keeper } from "./lib/deploy_commit_vol_keeper"

async function main() {
  await deploy_commit_vol_keeper()
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
