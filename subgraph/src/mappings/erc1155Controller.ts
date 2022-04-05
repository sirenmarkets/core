import {
  ERC1155ControllerInitialized,
  TransferSingle,
  TransferBatch,
  ApprovalForAll,
} from "../../generated/ERC1155Controller/ERC1155Controller"
import { SeriesController } from "../../generated/SeriesController/SeriesController"
import { SimpleToken } from "../../generated/templates/SimpleToken/SimpleToken"
import {
  Account,
  ERC1155AccountBalanceSnapshot,
  ERC1155AccountBalance,
  ERC1155TokenApprovalForAll,
  ERC1155Controller,
  ERC1155Token,
  ERC1155TokenBurn,
  ERC1155TokenMint,
  ERC1155TokenTransfer,
  SeriesEntity,
} from "../../generated/schema"
import { getId, getERC1155TransferId } from "./helpers/transaction"
import { ZERO, ONE, TWO } from "./helpers/number"
import { BigInt, Address, ethereum } from "@graphprotocol/graph-ts"
import { getOrCreateAccount } from "./account"
const GENESIS_ADDRESS = "0x0000000000000000000000000000000000000000"

export function handleERC1155ControllerInitialized(
  event: ERC1155ControllerInitialized,
): void {
  let erc1155Controller = new ERC1155Controller(event.address.toHexString())

  erc1155Controller.createdTransaction = event.transaction.hash
  erc1155Controller.createdBlock = event.block.number
  erc1155Controller.createdTimestamp = event.block.timestamp

  erc1155Controller.uri = "https://erc1155.sirenmarkets.com/v2/{id}.json"
  erc1155Controller.controller = event.params.controller

  erc1155Controller.save()
}

export function findOrCreateERC1155Token(
  seriesControllerAddress: Address,
  tokenIndex: BigInt,
): ERC1155Token {
  let tokenId =
    seriesControllerAddress.toHexString() + "-" + tokenIndex.toString()
  let token = ERC1155Token.load(tokenId)
  let seriesId = tokenIdToSeriesId(tokenIndex)

  if (token === null) {
    let seriesController = SeriesController.bind(seriesControllerAddress)
    token = new ERC1155Token(tokenId)

    token.index = tokenIndex

    let underlyingTokenContract = SimpleToken.bind(
      seriesController.underlyingToken(seriesId),
    )
    token.decimals = underlyingTokenContract.decimals()

    // Link to Series
    let seriesEntity = new SeriesEntity(
      seriesControllerAddress.toHexString() + "-" + seriesId.toString(),
    )
    token.series = seriesEntity.id

    token.type = isWToken(tokenIndex) ? "W_TOKEN" : "B_TOKEN"
    // Set initial supply
    token.totalSupply = ZERO

    token.totalBurned = ZERO
    token.totalMinted = ZERO
    token.totalTransferred = ZERO

    token.save()
  }

  return token as ERC1155Token
}

export function handleTransferSingle(event: TransferSingle): void {
  handleTransfer(
    event,
    event.params.id,
    event.params.operator,
    event.params.from,
    event.params.to,
    event.params.value,
  )
}

export function handleTransferBatch(event: TransferBatch): void {
  for (let i = 0; i < event.params.ids.length; i++) {
    let ids = event.params.ids
    let id = ids[i]
    let values = event.params.values
    let value = values[i]

    handleTransfer(
      event,
      id,
      event.params.operator,
      event.params.from,
      event.params.to,
      value,
    )
  }
}

export function handleApprovalForAll(event: ApprovalForAll): void {
  let approval = new ERC1155TokenApprovalForAll(getId(event))
  approval.erc1155Controller = event.address
  approval.owner = event.params.account
  approval.operator = event.params.operator
  approval.approved = event.params.approved
  approval.sender = event.transaction.from
  approval.block = event.block.number
  approval.timestamp = event.block.timestamp

  approval.save()
}

function handleTransfer(
  event: ethereum.Event,
  id: BigInt,
  operator: Address,
  from: Address,
  to: Address,
  amount: BigInt,
): void {
  let erc1155ControllerContract = ERC1155Controller.load(
    event.address.toHexString(),
  )
  let seriesControllerAddress = Address.fromString(
    erc1155ControllerContract.controller.toHexString(),
  )

  let token = findOrCreateERC1155Token(seriesControllerAddress, id)

  let isBurn = to.toHex() == GENESIS_ADDRESS
  let isMint = from.toHex() == GENESIS_ADDRESS
  let isTransfer = !isBurn && !isMint

  let eventId = getERC1155TransferId(event, id)

  if (isBurn) {
    let burn = new ERC1155TokenBurn(eventId)
    burn.tokens = [token.id]
    burn.amounts = [amount]
    burn.operator = operator
    burn.sender = event.transaction.from
    burn.eventType = "Burn"
    burn.block = event.block.number
    burn.timestamp = event.block.timestamp
    burn.burner = from
    burn.save()

    token.totalSupply = token.totalSupply.minus(amount)
    token.totalBurned = token.totalBurned.plus(amount)
    token.save()
  } else if (isMint) {
    let mint = new ERC1155TokenMint(eventId)
    mint.tokens = [token.id]
    mint.amounts = [amount]
    mint.operator = operator
    mint.sender = event.transaction.from
    mint.eventType = "Mint"
    mint.block = event.block.number
    mint.timestamp = event.block.timestamp
    mint.minter = event.transaction.from
    mint.destination = to
    mint.save()

    token.totalSupply = token.totalSupply.plus(amount)
    token.totalMinted = token.totalMinted.plus(amount)
    token.save()
  } else {
    let transfer = new ERC1155TokenTransfer(eventId)
    transfer.tokens = [token.id]
    transfer.amounts = [amount]
    transfer.operator = operator
    transfer.sender = event.transaction.from
    transfer.eventType = "Transfer"
    transfer.block = event.block.number
    transfer.timestamp = event.block.timestamp
    transfer.from = from
    transfer.to = to
    transfer.save()

    token.totalTransferred = token.totalTransferred.plus(amount)
    token.save()
  }

  // Updates balances of accounts
  if (isTransfer || isBurn) {
    let sourceAccount = getOrCreateAccount(from)

    let accountBalance = decreaseERC1155AccountBalance(
      sourceAccount,
      token as ERC1155Token,
      amount,
    )
    accountBalance.block = event.block.number
    accountBalance.modified = event.block.timestamp
    accountBalance.transaction = event.transaction.hash

    sourceAccount.save()
    accountBalance.save()

    // To provide information about evolution of account balances
    saveERC1155AccountBalanceSnapshot(accountBalance, eventId, event)
  }

  if (isTransfer || isMint) {
    let destinationAccount = getOrCreateAccount(to)

    let accountBalance = increaseERC1155AccountBalance(
      destinationAccount,
      token as ERC1155Token,
      amount,
    )
    accountBalance.block = event.block.number
    accountBalance.modified = event.block.timestamp
    accountBalance.transaction = event.transaction.hash

    destinationAccount.save()
    accountBalance.save()

    // To provide information about evolution of account balances
    saveERC1155AccountBalanceSnapshot(accountBalance, eventId, event)
  }
}

export function getOrCreateERC1155AccountBalance(
  account: Account,
  token: ERC1155Token,
): ERC1155AccountBalance {
  let balanceId = account.id + "-" + token.id
  let previousBalance = ERC1155AccountBalance.load(balanceId)

  if (previousBalance != null) {
    return previousBalance as ERC1155AccountBalance
  }

  let newBalance = new ERC1155AccountBalance(balanceId)
  newBalance.account = account.id
  newBalance.token = token.id
  newBalance.amount = ZERO

  return newBalance
}

export function increaseERC1155AccountBalance(
  account: Account,
  token: ERC1155Token,
  amount: BigInt,
): ERC1155AccountBalance {
  let balance = getOrCreateERC1155AccountBalance(account, token)
  balance.amount = balance.amount.plus(amount)

  return balance
}

export function decreaseERC1155AccountBalance(
  account: Account,
  token: ERC1155Token,
  amount: BigInt,
): ERC1155AccountBalance {
  let balance = getOrCreateERC1155AccountBalance(account, token)
  balance.amount = balance.amount.minus(amount)

  return balance
}

export function saveERC1155AccountBalanceSnapshot(
  balance: ERC1155AccountBalance,
  eventId: string,
  event: ethereum.Event,
): void {
  let snapshot = new ERC1155AccountBalanceSnapshot(
    balance.id + "-" + event.block.timestamp.toString(),
  )
  snapshot.account = balance.account
  snapshot.token = balance.token
  snapshot.amount = balance.amount

  snapshot.event = eventId

  snapshot.block = event.block.number
  snapshot.transaction = event.transaction.hash
  snapshot.timestamp = event.block.timestamp

  snapshot.save()
}

export function seriesIdToWTokenId(seriesId: BigInt): BigInt {
  return seriesId.times(TWO)
}

export function seriesIdToBTokenId(seriesId: BigInt): BigInt {
  return seriesId.times(TWO).plus(ONE)
}

function isWToken(tokenId: BigInt): boolean {
  return tokenId.mod(TWO) == ZERO
}

function tokenIdToSeriesId(tokenId: BigInt): BigInt {
  if (isWToken(tokenId)) {
    return tokenId.div(TWO)
  } else {
    return tokenId.minus(ONE).div(TWO)
  }
}
