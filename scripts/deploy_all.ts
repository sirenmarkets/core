import { deploySingletonContracts } from "./lib/deploy_singleton_contracts"
import { deployAmm } from "./lib/deploy_amm"
import { deployERC20s } from "./lib/deploy_erc20s"
import { deploySeries } from "./lib/deploy_series"

import { getNextFriday8amUTCTimestamp } from "../test/util"
import { argumentError } from "./lib/helper"

// to pass arguments, use env vars and pass them in the call itself, i.e.
// `ADMIN_ADDRESS=0xdeadbeef FEE_RECEIVER=0xbeefdead npx hardhat run scripts/deploy_all.ts
const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS
if (ADMIN_ADDRESS == null || ADMIN_ADDRESS == "") {
  argumentError("ADMIN_ADDRESS")
}

let FEE_RECEIVER = process.env.FEE_RECEIVER
if (FEE_RECEIVER == null || FEE_RECEIVER == "") {
  FEE_RECEIVER = ADMIN_ADDRESS
  console.log(
    `no argument given for FEE_RECEIVER, defaulting to the ADMIN_ADDRESS argument: ${ADMIN_ADDRESS}`,
  )
}

let TRADE_FEE_BASIS_POINTS = parseInt(process.env.TRADE_FEE_BASIS_POINTS)
if (Number.isNaN(TRADE_FEE_BASIS_POINTS) || TRADE_FEE_BASIS_POINTS == null) {
  TRADE_FEE_BASIS_POINTS = 0
  console.log(
    `no argument given for TRADE_FEE_BASIS_POINTS, defaulting to ${TRADE_FEE_BASIS_POINTS}`,
  )
}

let STRIKE_PRICE = parseInt(process.env.STRIKE_PRICE)
if (Number.isNaN(STRIKE_PRICE) || STRIKE_PRICE == null) {
  STRIKE_PRICE = 5000000000000
  console.log(
    `no argument given for STRIKE_PRICE, defaulting to ${STRIKE_PRICE}`,
  )
}

let EXPIRATION_DATE = parseInt(process.env.EXPIRATION_DATE)
if (Number.isNaN(EXPIRATION_DATE) || EXPIRATION_DATE == null) {
  EXPIRATION_DATE = getNextFriday8amUTCTimestamp(Math.floor(Date.now() / 1000))
  console.log(
    `no argument given for EXPIRATION_DATE, defaulting to ${EXPIRATION_DATE}`,
  )
}

let IS_PUT_OPTION_ARG = process.env.IS_PUT_OPTION
if (IS_PUT_OPTION_ARG == "" || IS_PUT_OPTION_ARG == null) {
  IS_PUT_OPTION_ARG = "false"
}
let IS_PUT_OPTION: boolean
if (IS_PUT_OPTION_ARG == "true") {
  IS_PUT_OPTION = true
} else {
  IS_PUT_OPTION = false
}

const PRICE_ORACLE_DATE_OFFSET = parseInt(process.env.PRICE_ORACLE_DATE_OFFSET)
if (
  Number.isNaN(PRICE_ORACLE_DATE_OFFSET) ||
  PRICE_ORACLE_DATE_OFFSET == null
) {
  argumentError("PRICE_ORACLE_DATE_OFFSET")
}

const CHAINLINK_ORACLE_ADDRESS = process.env.CHAINLINK_ORACLE_ADDRESS
if (CHAINLINK_ORACLE_ADDRESS == null || CHAINLINK_ORACLE_ADDRESS == "") {
  argumentError("CHAINLINK_ORACLE_ADDRESS")
}

async function main() {
  const { seriesController, priceOracle, ammFactory, ammDataProvider } =
    await deploySingletonContracts(
      FEE_RECEIVER,
      ADMIN_ADDRESS,
      PRICE_ORACLE_DATE_OFFSET,
    )

  const { wbtc, usdc } = await deployERC20s(ADMIN_ADDRESS)

  const { ammAddress } = await deployAmm(
    ammFactory.address,
    priceOracle.address,
    ammDataProvider.address,
    wbtc.address,
    usdc.address,
    wbtc.address,
    TRADE_FEE_BASIS_POINTS,
    CHAINLINK_ORACLE_ADDRESS,
  )

  await deploySeries(
    seriesController.address,
    wbtc.address,
    usdc.address,
    wbtc.address,
    STRIKE_PRICE,
    EXPIRATION_DATE,
    ammAddress,
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
