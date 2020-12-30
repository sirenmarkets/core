
import { Bytes, ethereum } from '@graphprotocol/graph-ts';

export function getId(
  event: ethereum.Event
): string {
  return event.transaction.hash.toHex() + '-' + event.logIndex.toString()
}