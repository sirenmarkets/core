import { deploySingletonContracts } from "./lib/deploy_singleton_contracts"
import { deployOracles } from "./lib/set_oracles"
import { argumentError } from "./lib/helper"

// to pass arguments, use env vars and pass them in the call itself, i.e.
// `ADMIN_ADDRESS=0xdeadbeef FEE_RECEIVER=0xbeefdead npx hardhat run scripts/deploy_singleton_contracts.ts

const PRICE_ORACLE_PROXY = process.env.PRICE_ORACLE_PROXY

const VOLATILTY_ORACLE_PROXY = process.env.VOLATILTY_ORACLE_PROXY

async function main() {
  await deployOracles(PRICE_ORACLE_PROXY, VOLATILTY_ORACLE_PROXY)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
