import { BigInt, ethereum } from "@graphprotocol/graph-ts"

export function getId(event: ethereum.Event): string {
  return event.transaction.hash.toHex() + "-" + event.logIndex.toString()
}

export function getERC1155TransferId(
  event: ethereum.Event,
  id: BigInt,
): string {
  return (
    event.transaction.hash.toHex() +
    "-" +
    event.logIndex.toString() +
    "-" +
    id.toString()
  )
}
