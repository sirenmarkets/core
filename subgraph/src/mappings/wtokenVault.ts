
  
  import { WTokenVault, WTokensLocked, LpSharesRedeemed, CollateralLocked } from "../../generated/templates/WTokenVault/WTokenVault"
  import {
    LockedExpirationPool,
    Account,
    SeriesEntity
  } from "../../generated/schema"
  import { ethereum, BigInt} from "@graphprotocol/graph-ts"

  export function handleWTokensLocked(event: WTokensLocked): void {
      let id = event.params.ammAddress.toHexString() + '-' + event.params.expirationDate

      let lockedExpirationPool = LockedExpirationPool.load(id)
      let account = Account.load(event.address.toHexString())

      if(lockedExpirationPool == null) {
          let newLockedExpirationPool = new LockedExpirationPool(id);
          newLockedExpirationPool.amm = event.params.ammAddress.toHexString()
          newLockedExpirationPool.lockedWTokens = event.params.wTokenAmount
          newLockedExpirationPool.expirationDate = event.params.expirationDate
          newLockedExpirationPool.availableCollateral =  new BigInt(0)

          let accountArray = [event.params.redeemer.toHexString()]
          newLockedExpirationPool.accounts = accountArray

          let expirationPoolsArray: Array<string>; 
          expirationPoolsArray = account.lockedExpirationPools; 
          expirationPoolsArray.push(newLockedExpirationPool.id)

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
            let newAccountsArray: Array<string>;
            newAccountsArray = lockedExpirationPool.accounts
            newAccountsArray.push(event.address.toHexString())

            lockedExpirationPool.accounts = newAccountsArray
        }
        }
        let newLockedWTokens = lockedExpirationPool.lockedWTokens.plus(event.params.wTokenAmount)
        
        lockedExpirationPool.lockedWTokens = newLockedWTokens
        lockedExpirationPool.save()
      }
  }
  
  export function handleLpSharesRedeemed(event: LpSharesRedeemed): void {
    // instruct the graph-node that to index the new Amm
    
  }

  export function handleCollateralLocked(event: CollateralLocked): void {
    let series = SeriesEntity.load(event.params.ammAddress.toHexString() + "-" + event.params.seriesId.toString())

    let id = event.params.ammAddress.toHexString() + '-' + series.expirationDate
    let lockedExpirationPool = LockedExpirationPool.load(id)

    lockedExpirationPool.availableCollateral =  lockedExpirationPool.availableCollateral.plus(event.params.collateralAmount)
    lockedExpirationPool.lockedWTokens = lockedExpirationPool.lockedWTokens.minus(event.params.wTokenAmount)

    lockedExpirationPool.save()

  }
