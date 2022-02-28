import { DataSourceContext } from "@graphprotocol/graph-ts"
import {
  AmmCreated,
  CodeAddressUpdated,
  OwnershipTransferred,
  TokenImplementationUpdated,
} from "../../generated/AmmFactory/AmmFactory"
import {
  MinterAmm as AmmContract,
} from "../../generated/templates/Amm/MinterAmm"
import { Amm as AmmTemplate } from "../../generated/templates"

export function handleCodeAddressUpdated(event: CodeAddressUpdated): void {}

export function handleAmmCreated(event: AmmCreated): void {
  // Get seriesController associated with this AMM
  let ammContract = AmmContract.bind(event.params.amm)
  let seriesController = ammContract.seriesController()
  let context = new DataSourceContext()
  context.setString("seriesController", seriesController.toHexString())

  // instruct the graph-node that to index the new Amm
  AmmTemplate.createWithContext(event.params.amm, context)
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

export function handleTokenImplementationUpdated(
  event: TokenImplementationUpdated,
): void {}
