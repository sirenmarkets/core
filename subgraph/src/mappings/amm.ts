import {
  AMMInitialized,
  MinterAmm as AmmContract,
} from "../../generated/templates/Amm/MinterAmm"
import { Amm } from "../../generated/schema"
import { findOrCreateToken } from "./simpleToken"

export function handleAMMInitialized(event: AMMInitialized): void {
  // create AMM
  let amm = new Amm(event.address.toHexString())
  let contract = AmmContract.bind(event.address)

  amm.createdTransaction = event.transaction.hash
  amm.createdBlock = event.block.number
  amm.createdTimestamp = event.block.timestamp
  amm.registry = contract.registry()
  amm.priceOracle = event.params.priceOracle
  amm.tradeFeeBasisPoints = contract.tradeFeeBasisPoints()
  amm.assetPair = contract.assetPair()

  // Handle tokens
  let paymentToken = contract.paymentToken()
  findOrCreateToken(paymentToken)
  amm.paymentToken = paymentToken.toHexString()

  let collateralToken = contract.collateralToken()
  findOrCreateToken(collateralToken)
  amm.collateralToken = collateralToken.toHexString()

  let lpToken = contract.lpToken()
  findOrCreateToken(lpToken)
  amm.lpToken = lpToken.toHexString()

  amm.save()
}
