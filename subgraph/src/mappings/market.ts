import { dataSource } from "@graphprotocol/graph-ts"
import {
  Market as MarketContract,
  CollateralClaimed,
  FeePaid,
  MarketDestroyed,
  MarketInitialized,
  OptionClosed,
  OptionExercised,
  OptionMinted,
  OwnershipTransferred,
  TokensRecovered,
} from "../../generated/templates/Market/Market"
import {
  Market,
  MarketInitialization,
  OptionClose,
  OptionExercise,
  OptionMint,
  Fee,
  OptionCollateralClaim,
} from "../../generated/schema"
import { getId } from "./helpers/transaction"
import { findOrCreateToken } from "./simpleToken"

export function handleMarketInitialized(event: MarketInitialized): void {
  // Create Market
  let market = new Market(event.address.toHexString())
  let contract = MarketContract.bind(event.address)

  // Populate market fields
  market.createdTransaction = event.transaction.hash
  market.createdBlock = event.block.number
  market.createdTimestamp = event.block.timestamp
  market.marketName = event.params.marketName
  let marketStyle = ""
  switch (contract.marketStyle()) {
    case 0:
      marketStyle = "EUROPEAN_STYLE"
      break
    case 1:
      marketStyle = "AMERICAN_STYLE"
      break
  }
  market.marketStyle = marketStyle
  market.priceRatio = contract.priceRatio()
  market.expirationDate = contract.expirationDate()
  market.exerciseFeeBasisPoints = contract.exerciseFeeBasisPoints()
  market.closeFeeBasisPoints = contract.closeFeeBasisPoints()
  market.claimFeeBasisPoints = contract.claimFeeBasisPoints()
  market.amm = contract.restrictedMinter().toHexString()

  let context = dataSource.context()
  market.marketIndex = context.getBigInt("marketIndex")

  // Save market because it is required in `findOrCreateToken`
  market.save()

  // tokens
  let wTokenAddress = contract.wToken()
  let bTokenAddress = contract.bToken()
  findOrCreateToken(wTokenAddress)
  findOrCreateToken(bTokenAddress)

  let collateralTokenAddress = contract.collateralToken()
  let paymentTokenAddress = contract.paymentToken()
  findOrCreateToken(collateralTokenAddress)
  findOrCreateToken(paymentTokenAddress)
  market.collateralToken = collateralTokenAddress.toHexString()
  market.paymentToken = paymentTokenAddress.toHexString()

  market.wToken = wTokenAddress.toHexString()
  market.bToken = bTokenAddress.toHexString()
  market.destroyed = false

  market.save()

  // Create MarketInitialization
  let marketInitialization = new MarketInitialization(getId(event))
  marketInitialization.market = market.id
  marketInitialization.wToken = event.params.wToken
  marketInitialization.bToken = event.params.bToken

  marketInitialization.save()
}

export function handleFeePaid(event: FeePaid): void {
  let market = Market.load(event.address.toHex())

  let fee = new Fee(getId(event))
  fee.market = market.id
  let feeType = ""
  switch (event.params.feeType) {
    case 0:
      feeType = "EXERCISE_FEE"
      break
    case 1:
      feeType = "CLOSE_FEE"
      break
    case 2:
      feeType = "CLAIM_FEE"
      break
  }
  fee.feeType = feeType
  let token = findOrCreateToken(event.params.token)
  fee.token = token.id
  fee.value = event.params.value

  fee.save()
}

export function handleMarketDestroyed(event: MarketDestroyed): void {
  let market = Market.load(event.address.toHexString())
  market.destroyed = true
  market.save()
}

export function handleOptionClosed(event: OptionClosed): void {
  let optionClose = new OptionClose(getId(event))
  optionClose.market = event.address.toHexString()
  optionClose.redeemer = event.params.redeemer
  optionClose.value = event.params.value
  optionClose.eventType = "Close"
  optionClose.block = event.block.number
  optionClose.timestamp = event.block.timestamp

  optionClose.save()
}

export function handleOptionExercised(event: OptionExercised): void {
  let optionExercise = new OptionExercise(getId(event))
  optionExercise.market = event.address.toHexString()
  optionExercise.redeemer = event.params.redeemer
  optionExercise.value = event.params.value
  optionExercise.eventType = "Exercise"
  optionExercise.block = event.block.number
  optionExercise.timestamp = event.block.timestamp

  optionExercise.save()
}

export function handleOptionMinted(event: OptionMinted): void {
  let optionMint = new OptionMint(getId(event))
  optionMint.market = event.address.toHexString()
  optionMint.minter = event.params.minter
  optionMint.value = event.params.value
  optionMint.eventType = "Mint"
  optionMint.block = event.block.number
  optionMint.timestamp = event.block.timestamp

  optionMint.save()
}

export function handleCollateralClaimed(event: CollateralClaimed): void {
  let market = Market.load(event.address.toHex())

  let collateralClaim = new OptionCollateralClaim(getId(event))
  collateralClaim.market = market.id
  collateralClaim.redeemer = event.params.redeemer
  collateralClaim.value = event.params.value
  collateralClaim.eventType = "CollateralClaim"
  collateralClaim.block = event.block.number
  collateralClaim.timestamp = event.block.timestamp

  collateralClaim.save()
}
