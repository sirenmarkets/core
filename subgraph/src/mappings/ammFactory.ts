import {
  AmmCreated,
  CodeAddressUpdated,
  OwnershipTransferred,
  TokenImplementationUpdated,
} from "../../generated/AmmFactory/AmmFactory"
import { Amm as AmmTemplate } from "../../generated/templates"

export function handleCodeAddressUpdated(event: CodeAddressUpdated): void {}

export function handleAmmCreated(event: AmmCreated): void {
  // instruct the graph-node that to index the new Amm
  AmmTemplate.create(event.params.amm)
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

export function handleTokenImplementationUpdated(
  event: TokenImplementationUpdated,
): void {}
