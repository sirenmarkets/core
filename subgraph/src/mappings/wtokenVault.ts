
  
  import { WTokenVault, WTokensLocked, LpSharesRedeemed, CollateralLocked } from "../../generated/templates/WTokenVault/WTokenVault"
  import {
    LockedExpirationPool,
    Account,
    SeriesEntity
  } from "../../generated/schema"
  import { ethereum, BigInt} from "@graphprotocol/graph-ts"

  export function handleWTokensLocked(event: WTokensLocked): void {
      let id = event.ammAddress.toHexString() + '-' + event.expirationDate

      let lockedExpirationPool = LockedExpirationPool.load(id)
      let account = Account.load(event.address.toHexString())

      if(lockedExpirationPool == null) {
          let newLockedExpirationPool = new LockedExpirationPool(id);
          newLockedExpirationPool.amm = event.ammAddress.toHexString()
          newLockedExpirationPool.lockedWTokens = event.wTokenAmount
          newLockedExpirationPool.expirationDate = event.expirationDate
          newLockedExpirationPool.availableCollateral =  new BigInt(0)

          let accountArray = [event.redeemer.toHexString()]
          newLockedExpirationPool.accounts = accountArray

          let expirationPoolsArray = account.lockedExpirationPools.push(newLockedExpirationPool.id)
          account.lockedExpirationPools = expirationPoolsArray

          account.save()

          newLockedExpirationPool.save()

      }
      else {
        for(let i = 0; i < lockedExpirationPool.accounts.length; i++) { 
          if(event.address.toHexString() == lockedExpirationPool.accounts[i]) { 
            break;
          }
          if (i === lockedExpirationPool.accounts.length - 1) {
            let newAccountsArray = lockedExpirationPool.accounts.push(event.address.toHexString())
            lockedExpirationPool.accounts = newAccountsArray
        }
        }
        let newLockedWTokens = lockedExpirationPool.lockedWTokens + event.wTokenAmount
        lockedExpirationPool.lockedWTokens = newLockedWTokens
        lockedExpirationPool.save()
      }
  }
  
  export function handleLpSharesRedeemed(event: LpSharesRedeemed): void {
    // instruct the graph-node that to index the new Amm
    
  }

  export function handleCollateralLocked(event: CollateralLocked): void {
    let series = SeriesEntity.load(event.seriesId)

    let id = event.ammAddress.toHexString() + '-' + series.expirationDate
    let lockedExpirationPool = LockedExpirationPool.load(id)

    lockedExpirationPool.availableCollateral =  lockedExpirationPool.availableCollateral.plus(event.collateralAmmount)
    lockedExpirationPool.lockedWTokens = lockedExpirationPool.lockedWTokens.minus(event.wTokenAmount)

    lockedExpirationPool.save()

  }
