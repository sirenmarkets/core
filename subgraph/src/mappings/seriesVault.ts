import { SeriesVaultInitialized } from "../../generated/SeriesVault/SeriesVault"
import { SeriesVault as SeriesVaultEntity } from "../../generated/schema"

export function handleSeriesVaultInitialized(
  event: SeriesVaultInitialized,
): void {
  let vault = new SeriesVaultEntity(event.address.toHexString())

  vault.createdTransaction = event.transaction.hash
  vault.createdBlock = event.block.number
  vault.createdTimestamp = event.block.timestamp

  vault.controller = event.params.controller

  vault.save()
}
