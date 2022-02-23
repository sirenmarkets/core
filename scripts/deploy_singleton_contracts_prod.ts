import { deploySingletonContractsProd } from "./lib/deploy_singleton_contracts_prod"
import { argumentError } from "./lib/helper"

const PRICE_ORACLE_DATE_OFFSET = parseInt(process.env.PRICE_ORACLE_DATE_OFFSET)
if (
  Number.isNaN(PRICE_ORACLE_DATE_OFFSET) ||
  PRICE_ORACLE_DATE_OFFSET == null
) {
  argumentError("PRICE_ORACLE_DATE_OFFSET")
}

async function main() {
  await deploySingletonContractsProd(PRICE_ORACLE_DATE_OFFSET)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
