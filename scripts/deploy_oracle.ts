import { deploySingletonContracts } from "./lib/deploy_singleton_contracts"
import { deployOracles } from "./lib/set_oracles"
import { argumentError } from "./lib/helper"

// to pass arguments, use env vars and pass them in the call itself, i.e.
// `ADMIN_ADDRESS=0xdeadbeef FEE_RECEIVER=0xbeefdead npx hardhat run scripts/deploy_singleton_contracts.ts

const PRICE_ORACLE_PROXY = process.env.PRICE_ORACLE_PROXY

const VOLATILTY_ORACLE_PROXY = process.env.VOLATILTY_ORACLE_PROXY

const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS
if (ADMIN_ADDRESS == null || ADMIN_ADDRESS == "") {
  argumentError("ADMIN_ADDRESS")
}

const PRICE_ORACLE_DATE_OFFSET = parseInt(process.env.PRICE_ORACLE_DATE_OFFSET)
if (
  Number.isNaN(PRICE_ORACLE_DATE_OFFSET) ||
  PRICE_ORACLE_DATE_OFFSET == null
) {
  argumentError("PRICE_ORACLE_DATE_OFFSET")
}

async function main() {
  await deployOracles(
    ADMIN_ADDRESS,
    PRICE_ORACLE_DATE_OFFSET,
    PRICE_ORACLE_PROXY,
    VOLATILTY_ORACLE_PROXY,
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
