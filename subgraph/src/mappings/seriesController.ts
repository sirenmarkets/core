import { BigInt } from "@graphprotocol/graph-ts"
import {
  SeriesController,
  SeriesCreated,
  SeriesControllerInitialized,
  OptionMinted,
  AllowedExpirationUpdated,
} from "../../generated/SeriesController/SeriesController"
import {
  SeriesController as SeriesControllerEntity,
  SeriesEntity,
  ERC1155Token,
  OptionMint,
  SeriesAmm,
  Expiration,
} from "../../generated/schema"
import { getId } from "./helpers/transaction"
import { ZERO } from "./helpers/number"
import { findOrCreateToken } from "./simpleToken"
import {
  findOrCreateERC1155Token,
  seriesIdToWTokenId,
  seriesIdToBTokenId,
} from "./erc1155Controller"

export function handleSeriesCreated(event: SeriesCreated): void {
  let seriesControllerAddress = event.address.toHexString()
  let controller = SeriesController.bind(event.address)

  let seriesId = event.params.seriesId

  // Create Series
  let series = new SeriesEntity(
    seriesControllerAddress + "-" + seriesId.toString(),
  )

  // Populate series fields

  series.createdBlock = event.block.number
  series.createdTransaction = event.transaction.hash
  series.createdTimestamp = event.block.timestamp

  series.seriesName = controller.seriesName(seriesId)
  series.seriesId = seriesId

  // ERC20 tokens
  let underlyingTokenAddress = event.params.tokens.underlyingToken
  series.underlyingToken = underlyingTokenAddress.toHexString()
  let priceTokenAddress = event.params.tokens.priceToken
  series.priceToken = priceTokenAddress.toHexString()
  let collateralTokenAddress = event.params.tokens.collateralToken
  series.collateralToken = collateralTokenAddress.toHexString()
  findOrCreateToken(underlyingTokenAddress)
  findOrCreateToken(priceTokenAddress)
  findOrCreateToken(collateralTokenAddress)

  series.isPutOption = event.params.isPutOption
  series.strikePrice = event.params.strikePrice
  series.expirationDate = event.params.expirationDate
  series.expiration = event.params.expirationDate.toString()
  series.exerciseFeeBasisPoints = controller.exerciseFeeBasisPoints(seriesId)
  series.closeFeeBasisPoints = controller.closeFeeBasisPoints(seriesId)
  series.claimFeeBasisPoints = controller.claimFeeBasisPoints(seriesId)

  // load the SeriesController entity so we can get its price oracle
  let seriesControllerEntity = SeriesControllerEntity.load(
    seriesControllerAddress,
  )
  if(seriesControllerEntity === null ){
    return
  }
  series.priceOracle = seriesControllerEntity.priceOracle

  // ERC1155 tokens
  series.wToken = findOrCreateERC1155Token(
    event.address,
    seriesIdToWTokenId(seriesId),
  ).id
  series.bToken = findOrCreateERC1155Token(
    event.address,
    seriesIdToBTokenId(seriesId),
  ).id

  series.save()

  // create SeriesAmm
  let restrictedMinters = event.params.restrictedMinters
  for (let i = 0; i < restrictedMinters.length; i++) {
    let restrictedMinter = restrictedMinters[i]
    let seriesAmm = new SeriesAmm(
      series.id + "-" + restrictedMinter.toHexString(),
    )
    seriesAmm.series = series.id
    seriesAmm.amm = restrictedMinter.toHexString()

    seriesAmm.save()
  }
}

export function handleSeriesControllerInitialized(
  event: SeriesControllerInitialized,
): void {
  // create SeriesController entity
  let seriesControllerEntity = new SeriesControllerEntity(
    event.address.toHexString(),
  )

  seriesControllerEntity.createdBlock = event.block.number
  seriesControllerEntity.lastUpdatedBlock = event.block.number
  seriesControllerEntity.createdTimestamp = event.block.timestamp
  seriesControllerEntity.lastUpdatedTimestamp = event.block.timestamp
  seriesControllerEntity.createdTransaction = event.transaction.hash
  seriesControllerEntity.lastUpdatedTransaction = event.transaction.hash

  seriesControllerEntity.priceOracle = event.params.priceOracle
  seriesControllerEntity.vault = event.params.vault.toHexString()
  seriesControllerEntity.erc1155Controller = event.params.erc1155Controller

  seriesControllerEntity.feeReceiver = event.params.fees.feeReceiver
  seriesControllerEntity.exerciseFeeBasisPoints =
    event.params.fees.exerciseFeeBasisPoints
  seriesControllerEntity.closeFeeBasisPoints =
    event.params.fees.closeFeeBasisPoints
  seriesControllerEntity.claimFeeBasisPoints =
    event.params.fees.claimFeeBasisPoints

  seriesControllerEntity.save()
}

export function handleOptionMinted(event: OptionMinted): void {
  let optionMint = new OptionMint(getId(event))

  let seriesEntity = new SeriesEntity(
    event.address.toHexString() + "-" + event.params.seriesId.toString(),
  )
  optionMint.series = seriesEntity.id
  optionMint.minter = event.params.minter
  optionMint.optionTokenAmount = event.params.optionTokenAmount
  optionMint.wTokenTotalSupply = event.params.wTokenTotalSupply
  optionMint.bTokenTotalSupply = event.params.bTokenTotalSupply
  optionMint.eventType = "Mint"
  optionMint.block = event.block.number
  optionMint.timestamp = event.block.timestamp

  optionMint.save()
}

export function handleAllowedExpirationUpdated(event: AllowedExpirationUpdated): void {
  findOrCreateExpiration(event.params.newAllowedExpiration)
}

function findOrCreateExpiration(expirationDate: BigInt): Expiration {
  let expiration = Expiration.load(expirationDate.toString())
  if (expiration === null) {
    expiration = new Expiration(expirationDate.toString())
    expiration.save()
  }
  return expiration as Expiration
}