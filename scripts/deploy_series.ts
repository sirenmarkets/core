import { deploySeries } from "./lib/deploy_series"
import { argumentError } from "./lib/helper"

const SERIES_CONTROLLER_ADDRESS = process.env.SERIES_CONTROLLER_ADDRESS
if (SERIES_CONTROLLER_ADDRESS == null || SERIES_CONTROLLER_ADDRESS == "") {
  argumentError("SERIES_CONTROLLER_ADDRESS")
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

const STRIKE_PRICE = parseInt(process.env.STRIKE_PRICE)
if (STRIKE_PRICE == NaN || STRIKE_PRICE == null) {
  argumentError("STRIKE_PRICE")
}

const EXPIRATION_DATE = parseInt(process.env.EXPIRATION_DATE)
if (EXPIRATION_DATE == NaN || EXPIRATION_DATE == null) {
  argumentError("EXPIRATION_DATE")
}

const RESTRICTED_MINTER = process.env.RESTRICTED_MINTER
if (RESTRICTED_MINTER == "" || RESTRICTED_MINTER == null) {
  argumentError("RESTRICTED_MINTER")
}

const IS_PUT_OPTION_ARG = process.env.IS_PUT_OPTION
if (IS_PUT_OPTION_ARG == "" || IS_PUT_OPTION_ARG == null) {
  argumentError("IS_PUT_OPTION")
}
let IS_PUT_OPTION: boolean
if (IS_PUT_OPTION_ARG == "true") {
  IS_PUT_OPTION = true
} else if (IS_PUT_OPTION_ARG == "false") {
  IS_PUT_OPTION = false
} else {
  throw new Error(
    `unknown argument for IS_PUT_OPTION: ${IS_PUT_OPTION}, must be "true" or "false"`,
  )
}

async function main() {
  await deploySeries(
    SERIES_CONTROLLER_ADDRESS,
    UNDERLYING_ADDRESS,
    PRICE_ADDRESS,
    COLLATERAL_ADDRESS,
    STRIKE_PRICE,
    EXPIRATION_DATE,
    RESTRICTED_MINTER,
    IS_PUT_OPTION,
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
