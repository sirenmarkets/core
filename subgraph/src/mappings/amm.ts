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
  amm.paymentToken = contract.paymentToken().toHexString()
  amm.collateralToken = contract.collateralToken().toHexString()
  amm.tradeFeeBasisPoints = contract.tradeFeeBasisPoints()
  let lpToken = contract.lpToken()
  findOrCreateToken(lpToken)
  amm.lpToken = lpToken.toHexString()
  amm.assetPair = contract.assetPair()

  amm.save()
}
