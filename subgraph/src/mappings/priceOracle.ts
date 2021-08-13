import {
  SettlementPriceSet,
  OracleSet,
} from "../../generated/PriceOracle/PriceOracle"
import { SettlementPrice, OracleSetting } from "../../generated/schema"

export function handleSettlementPriceSet(event: SettlementPriceSet): void {
  let id =
    event.address.toHexString() +
    "-" +
    event.params.underlyingToken.toHexString() +
    "-" +
    event.params.priceToken.toHexString() +
    "-" +
    event.params.settlementDate.toString()
  let settlementPrice = new SettlementPrice(id)

  settlementPrice.priceOracleAddress = event.address

  settlementPrice.createdTransaction = event.transaction.hash
  settlementPrice.createdBlock = event.block.number
  settlementPrice.createdTimestamp = event.block.timestamp

  settlementPrice.underlyingToken = event.params.underlyingToken
  settlementPrice.priceToken = event.params.priceToken
  settlementPrice.settlementDate = event.params.settlementDate
  settlementPrice.price = event.params.price

  settlementPrice.save()
}

export function handleOracleSet(event: OracleSet): void {
  let id =
    event.address.toHexString() +
    "-" +
    event.params.underlyingToken.toHexString() +
    "-" +
    event.params.priceToken.toHexString()
  let oracleSetting = new OracleSetting(id)

  oracleSetting.priceOracleAddress = event.address

  oracleSetting.createdTransaction = event.transaction.hash
  oracleSetting.createdBlock = event.block.number
  oracleSetting.createdTimestamp = event.block.timestamp

  oracleSetting.underlyingToken = event.params.underlyingToken
  oracleSetting.priceToken = event.params.priceToken
  oracleSetting.oracle = event.params.oracle
  oracleSetting.earliestSettlementDate = event.params.earliestSettlementDate

  oracleSetting.save()
}
