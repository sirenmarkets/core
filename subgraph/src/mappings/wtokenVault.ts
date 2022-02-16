
  
  import { WTokenVault, WTokensLocked, LpSharesRedeemed, CollateralLocked } from "../../generated/templates/WTokenVault/WTokenVault"
  import {
    MinterAmm as AmmContract,
  } from "../../generated/templates/Amm/MinterAmm"
  import {
    LockedExpirationPool,
    Account,
    SeriesEntity,
    SeriesAmm,
    ERC1155Controller,
    SeriesController
  } from "../../generated/schema"
  import { ethereum, BigInt, log} from "@graphprotocol/graph-ts"
  import { getOrCreateAccount } from "./account"

  export function handleWTokensLocked(event: WTokensLocked): void {
      let id = event.params.ammAddress.toHexString() + '-' + event.params.expirationDate.toHexString()

      let lockedExpirationPool = LockedExpirationPool.load(id)

      let account = getOrCreateAccount(event.params.redeemer)

      if(lockedExpirationPool == null) {
          let newLockedExpirationPool = new LockedExpirationPool(id);

          newLockedExpirationPool.amm = event.params.ammAddress.toHexString()
          newLockedExpirationPool.lockedWTokens = event.params.wTokenAmount
          newLockedExpirationPool.expirationDate = event.params.expirationDate
          let availableCollateral:BigInt = new BigInt(0)
          newLockedExpirationPool.availableCollateral =  availableCollateral

          let accountsArray = account.lockedExpirationPools;
          accountsArray.push(newLockedExpirationPool.id)
          account.lockedExpirationPools = accountsArray
          account.save()

          newLockedExpirationPool.save()

      }
      else {
          if(!account.lockedExpirationPools.includes(lockedExpirationPool.id)) {
            let accountsArray = account.lockedExpirationPools;
            accountsArray.push(lockedExpirationPool.id)
            account.lockedExpirationPools = accountsArray

            account.save()
          }
        let newLockedWTokens: BigInt = lockedExpirationPool.lockedWTokens.plus(event.params.wTokenAmount)

        lockedExpirationPool.lockedWTokens = newLockedWTokens
        lockedExpirationPool.save()
      }
  }

  export function handleLpSharesRedeemed(event: LpSharesRedeemed): void {
    // instruct the graph-node that to index the new Amm
  }

  export function handleCollateralLocked(event: CollateralLocked): void {

    let id = event.params.ammAddress.toHexString() + '-' + event.params.expirationDate.toHexString()
    let lockedExpirationPool = LockedExpirationPool.load(id)

    lockedExpirationPool.availableCollateral =  lockedExpirationPool.availableCollateral.plus(event.params.collateralAmount)
    lockedExpirationPool.lockedWTokens = lockedExpirationPool.lockedWTokens.minus(event.params.wTokenAmount)

    lockedExpirationPool.save()

  }
