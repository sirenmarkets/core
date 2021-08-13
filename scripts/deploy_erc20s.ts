import { deployERC20s } from "./lib/deploy_erc20s"
import { argumentError } from "./lib/helper"

const OWNER = process.env.OWNER
if (OWNER == null || OWNER == "") {
  argumentError("OWNER")
}

async function main() {
  await deployERC20s(OWNER)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
