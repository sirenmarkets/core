import { deployAmm } from "./lib/deploy_amm"
import { argumentError } from "./lib/helper"

const AMM_FACTORY_ADDRESS = process.env.AMM_FACTORY_ADDRESS
if (AMM_FACTORY_ADDRESS == null || AMM_FACTORY_ADDRESS == "") {
  argumentError("AMM_FACTORY_ADDRESS")
}

const PRICE_ORACLE_ADDRESS = process.env.PRICE_ORACLE_ADDRESS
if (PRICE_ORACLE_ADDRESS == null || PRICE_ORACLE_ADDRESS == "") {
  argumentError("PRICE_ORACLE_ADDRESS")
}

const AMM_DATA_PROVIDER_ADDRESS = process.env.AMM_DATA_PROVIDER_ADDRESS
if (AMM_DATA_PROVIDER_ADDRESS == null || AMM_DATA_PROVIDER_ADDRESS == "") {
  argumentError("AMM_DATA_PROVIDER_ADDRESS")
}

const UNDERLYING_ADDRESS = process.env.UNDERLYING_ADDRESS
if (UNDERLYING_ADDRESS == null || UNDERLYING_ADDRESS == "") {
  argumentError("UNDERLYING_ADDRESS")
}

const PRICE_ADDRESS = process.env.PRICE_ADDRESS
if (PRICE_ADDRESS == null || PRICE_ADDRESS == "") {
  argumentError("PRICE_ADDRESS")
}

const COLLATERAL_ADDRESS = process.env.COLLATERAL_ADDRESS
if (COLLATERAL_ADDRESS == null || COLLATERAL_ADDRESS == "") {
  argumentError("COLLATERAL_ADDRESS")
}

const TRADE_FEE_BASIS_POINTS = parseInt(process.env.TRADE_FEE_BASIS_POINTS)
if (Number.isNaN(TRADE_FEE_BASIS_POINTS) || TRADE_FEE_BASIS_POINTS == null) {
  argumentError("TRADE_FEE_BASIS_POINTS")
}

const CHAINLINK_ORACLE_ADDRESS = process.env.CHAINLINK_ORACLE_ADDRESS
if (CHAINLINK_ORACLE_ADDRESS == null || CHAINLINK_ORACLE_ADDRESS == "") {
  argumentError("CHAINLINK_ORACLE_ADDRESS")
}

async function main() {
  await deployAmm(
    AMM_FACTORY_ADDRESS,
    PRICE_ORACLE_ADDRESS,
    AMM_DATA_PROVIDER_ADDRESS,
    UNDERLYING_ADDRESS,
    PRICE_ADDRESS,
    COLLATERAL_ADDRESS,
    TRADE_FEE_BASIS_POINTS,
    CHAINLINK_ORACLE_ADDRESS,
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
