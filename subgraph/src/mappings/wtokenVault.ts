
  
  import { WTokenVault, WTokensLocked, LpSharesRedeemed, CollateralLocked } from "../../generated/templates/WTokenVault/WTokenVault"
  import {
    LockedExpirationPool,
    Account,
    SeriesEntity,
    SeriesAmm
  } from "../../generated/schema"
  import { ethereum, BigInt} from "@graphprotocol/graph-ts"

  export function handleWTokensLocked(event: WTokensLocked): void {
      let id = event.params.ammAddress.toHexString() + '-' + event.params.expirationDate.toHexString()

      let lockedExpirationPool = LockedExpirationPool.load(id)
      let account = Account.load(event.address.toHexString())

      if(lockedExpirationPool == null) {
          let newLockedExpirationPool = new LockedExpirationPool(id);
          newLockedExpirationPool.amm = event.params.ammAddress.toHexString()
          newLockedExpirationPool.lockedWTokens = event.params.wTokenAmount
          newLockedExpirationPool.expirationDate = event.params.expirationDate
          let availableCollateral:BigInt = new BigInt(0)
          newLockedExpirationPool.availableCollateral =  availableCollateral

          // account.lockedExpirationPools.push(newLockedExpirationPool.id)

          // account.lockedExpirationPools = account.lockedExpirationPools

          // account.save()

          newLockedExpirationPool.save()

      }
      else {
        let lockedExpirationAccounts = lockedExpirationPool.accounts

        let newLockedWTokens: BigInt = lockedExpirationPool.lockedWTokens.plus(event.params.wTokenAmount)

        lockedExpirationPool.lockedWTokens = newLockedWTokens
        lockedExpirationPool.save()
      }
  }

  export function handleLpSharesRedeemed(event: LpSharesRedeemed): void {
    // instruct the graph-node that to index the new Amm
  }
  
  export function handleCollateralLocked(event: CollateralLocked): void {
    // let seriesAmm = SeriesAmm.load(event.params.ammAddress.toHexString()+'-'+event.params.seriesId.toHexString())
    // let series = SeriesEntity.load(seriesAmm.series)

    // let id = event.params.ammAddress.toHexString() + '-' + series.expirationDate.toHexString()
    // let lockedExpirationPool = LockedExpirationPool.load(id)

    // lockedExpirationPool.availableCollateral =  lockedExpirationPool.availableCollateral.plus(event.params.collateralAmount)
    // lockedExpirationPool.lockedWTokens = lockedExpirationPool.lockedWTokens.minus(event.params.wTokenAmount)

    // lockedExpirationPool.save()

  }
