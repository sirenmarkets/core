import {
  AMMInitialized,
  LpTokensMinted,
  LpTokensBurned,
  BTokensBought,
  BTokensSold,
  WTokensSold,
  MinterAmm as AmmContract,
} from "../../generated/templates/Amm/MinterAmm"
import {AmmDataProvider } from "../../generated/templates/AmmDataProvider/AmmDataProvider"

import { SimpleToken as SimpleTokenContract } from "../../generated/templates/Amm/SimpleToken"
import {
  Amm,
  PoolValueSnapshot,
  SeriesController,
  LpTokenMinted,
  LpTokenBurned,
  BTokenBought,
  BTokenSold,
  WTokenSold
} from "../../generated/schema"
import { findOrCreateToken } from "./simpleToken"
import { getId } from "./helpers/transaction"
import { ethereum, BigInt, dataSource } from "@graphprotocol/graph-ts"

export function handleAMMInitialized(event: AMMInitialized): void {
  // create AMM
  let amm = new Amm(event.address.toHexString())
  let contract = AmmContract.bind(event.address)

  amm.createdTransaction = event.transaction.hash
  amm.createdBlock = event.block.number
  amm.createdTimestamp = event.block.timestamp
  amm.controller = SeriesController.load(
    event.params.controller.toHexString(),
  ).id

  amm.tradeFeeBasisPoints = contract.tradeFeeBasisPoints()

  // Handle tokens
  let underlyingToken = contract.underlyingToken()
  findOrCreateToken(underlyingToken)
  amm.underlyingToken = underlyingToken.toHexString()

  let priceToken = contract.priceToken()
  findOrCreateToken(priceToken)
  amm.priceToken = priceToken.toHexString()

  let collateralToken = contract.collateralToken()
  findOrCreateToken(collateralToken)
  amm.collateralToken = collateralToken.toHexString()

  let lpToken = contract.lpToken()
  findOrCreateToken(lpToken)
  amm.lpToken = lpToken.toHexString()

  amm.save()
}

export function handleLpTokensMinted(event: LpTokensMinted): void {
  let poolValueSnapShot = takePoolValueSnapshot(event)

  let lpTokenMinted = new LpTokenMinted(getId(event))
  lpTokenMinted.account = event.params.minter.toHexString()
  lpTokenMinted.collateralAmount = event.params.collateralAdded
  lpTokenMinted.tokenAmount = event.params.lpTokensMinted
  lpTokenMinted.eventType = ["LpTokenMint"]
  lpTokenMinted.amm = event.address.toHexString()
  lpTokenMinted.block = event.block.number
  lpTokenMinted.timestamp = event.block.timestamp
  lpTokenMinted.poolValueSnapshot = poolValueSnapShot.id
  lpTokenMinted.transaction = event.transaction.hash.toHex()

  lpTokenMinted.save()
}

export function handleLpTokensBurned(event: LpTokensBurned): void {
  let poolValueSnapShot = takePoolValueSnapshot(event)

  let lpTokenBurned = new LpTokenBurned(getId(event))
  lpTokenBurned.account = event.params.redeemer.toHexString()
  lpTokenBurned.collateralAmount = event.params.collateralRemoved
  lpTokenBurned.tokenAmount = event.params.lpTokensBurned
  lpTokenBurned.eventType = ["LpTokenBurn"]
  lpTokenBurned.amm = event.address.toHexString()
  lpTokenBurned.block = event.block.number
  lpTokenBurned.timestamp = event.block.timestamp
  lpTokenBurned.poolValueSnapshot = poolValueSnapShot.id
  lpTokenBurned.transaction = event.transaction.hash.toHex()

  lpTokenBurned.save()

}
export function handleBTokensBought(event: BTokensBought): void {
  let poolValueSnapShot = takePoolValueSnapshot(event)

  let bTokenBought = new BTokenBought(getId(event))
  bTokenBought.account = event.params.buyer.toHexString()
  bTokenBought.collateralAmount = event.params.collateralPaid
  bTokenBought.tokenAmount = event.params.bTokensBought
  bTokenBought.eventType = ["BTokenBought"]
  bTokenBought.amm = event.address.toHexString()
  bTokenBought.block = event.block.number
  bTokenBought.timestamp = event.block.timestamp
  bTokenBought.poolValueSnapshot = poolValueSnapShot.id
  bTokenBought.seriesId = event.params.seriesId  
  bTokenBought.series = getSeriesControllerAddress() + "-" + event.params.seriesId.toString()
  bTokenBought.transaction = event.transaction.hash.toHex()

  bTokenBought.save()
}

export function handleBTokensSold(event: BTokensSold): void {
  let poolValueSnapShot = takePoolValueSnapshot(event)

  let bTokenSold = new BTokenSold(getId(event))
  bTokenSold.account = event.params.seller.toHexString()
  bTokenSold.collateralAmount = event.params.collateralPaid
  bTokenSold.tokenAmount = event.params.bTokensSold
  bTokenSold.eventType = ["BTokenSold"]
  bTokenSold.amm = event.address.toHexString()
  bTokenSold.block = event.block.number
  bTokenSold.timestamp = event.block.timestamp
  bTokenSold.poolValueSnapshot = poolValueSnapShot.id
  bTokenSold.seriesId = event.params.seriesId  
  bTokenSold.series = getSeriesControllerAddress() + "-" + event.params.seriesId.toString()
  bTokenSold.transaction = event.transaction.hash.toHex()

  bTokenSold.save()
}

export function handleWTokensSold(event: WTokensSold): void {
  let poolValueSnapShot = takePoolValueSnapshot(event)

  let wTokenSold = new WTokenSold(getId(event))
  wTokenSold.account = event.params.seller.toHexString()
  wTokenSold.collateralAmount = event.params.collateralPaid
  wTokenSold.tokenAmount = event.params.wTokensSold
  wTokenSold.eventType = ["WTokenSold"]
  wTokenSold.amm = event.address.toHexString()
  wTokenSold.block = event.block.number
  wTokenSold.timestamp = event.block.timestamp
  wTokenSold.poolValueSnapshot = poolValueSnapShot.id
  wTokenSold.seriesId = event.params.seriesId  
  wTokenSold.series = getSeriesControllerAddress() + "-" + event.params.seriesId.toString()
  wTokenSold.transaction = event.transaction.hash.toHex()

  wTokenSold.save()
}

function takePoolValueSnapshot(event: ethereum.Event): PoolValueSnapshot {

  let poolValueSnapshot = new PoolValueSnapshot(getId(event))

  let ammContract = AmmContract.bind(event.address)
  let ammDataProviderAddress = ammContract.try_getAmmDataProvider()
  let totalPoolValue = new BigInt(0);
  if(ammDataProviderAddress.reverted == false){
    let ammDataProviderContract = AmmDataProvider.bind(ammDataProviderAddress.value)
    totalPoolValue = ammDataProviderContract.getTotalPoolValueView(event.address, true)
  }
  else {
    totalPoolValue = new BigInt(0)
  }

  let lpTokenContract = SimpleTokenContract.bind(ammContract.lpToken())

  poolValueSnapshot.amm = event.address.toHexString()
  poolValueSnapshot.poolValue = totalPoolValue
  poolValueSnapshot.lpTokenSupply = lpTokenContract.totalSupply()
  poolValueSnapshot.createdTransaction = event.transaction.hash
  poolValueSnapshot.createdBlock = event.block.number
  poolValueSnapshot.createdTimestamp = event.block.timestamp

  poolValueSnapshot.save()

  return poolValueSnapshot as PoolValueSnapshot
}

function getSeriesControllerAddress(): String {
  let context = dataSource.context()
  return context.getString('seriesController')
}
