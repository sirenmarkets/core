import { deployVolatilityOracle } from "./lib/deploy_volatility_oracle"
import { argumentError } from "./lib/helper"

const PRICE_ORACLE_DATE_OFFSET = parseInt(process.env.PRICE_ORACLE_DATE_OFFSET)
const WINDOW_DAYS = parseInt(process.env.WINDOW_DAYS)
const ADDRESSES_PROVIDER = process.env.ADDRESSES_PROVIDER

if (
  Number.isNaN(PRICE_ORACLE_DATE_OFFSET) ||
  PRICE_ORACLE_DATE_OFFSET == null
) {
  argumentError("PRICE_ORACLE_DATE_OFFSET")
}

async function main() {
  await deployVolatilityOracle(
    PRICE_ORACLE_DATE_OFFSET,
    WINDOW_DAYS,
    ADDRESSES_PROVIDER,
  )
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
