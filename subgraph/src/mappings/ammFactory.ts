import { DataSourceContext, log } from "@graphprotocol/graph-ts"
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
import {
  Account,
} from "../../generated/schema"


export function handleCodeAddressUpdated(event: CodeAddressUpdated): void {}

export function handleAmmCreated(event: AmmCreated): void {
  // Get seriesController associated with this AMM
  let ammContract = AmmContract.bind(event.params.amm)
  let seriesController = ammContract.seriesController()
  let context = new DataSourceContext()
  context.setString("seriesController", seriesController.toHexString())

  // instruct the graph-node that to index the new Amm
  AmmTemplate.createWithContext(event.params.amm, context)

  // We have to create account for this address
  // with isAmm = true
  let ammAcc = Account.load(event.params.amm.toHex())
  if(ammAcc === null) {
    let newAmmAcc = new Account(event.params.amm.toHex())
    newAmmAcc.lockedExpirationPools = []
    newAmmAcc.address = event.params.amm
    newAmmAcc.isAmm = true
    newAmmAcc.save() 
  }
  else {
    // This should never happen
    log.error("The account already exists for AMM {} {}",
    [event.params.amm.toHex(),
    "and it should not."])
  }
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

export function handleTokenImplementationUpdated(
  event: TokenImplementationUpdated,
): void {}
