import { Address, BigInt } from "@graphprotocol/graph-ts"
import {
  Approval,
  Transfer,
  SimpleToken,
} from "../../generated/templates/SimpleToken/SimpleToken"
import {
  Token,
  TokenApproval,
  TokenTransfer,
  TokenMint,
  TokenBurn,
} from "../../generated/schema"
import { SimpleToken as SimpleTokenTemplate } from "../../generated/templates"
import { getId } from "./helpers/transaction"
import {
  decreaseAccountBalance,
  getOrCreateAccount,
  increaseAccountBalance,
  saveAccountBalanceSnapshot,
} from "./account"

import { ZERO } from "./helpers/number"

export function findOrCreateToken(address: Address): Token {
  let tokenId = address.toHexString()
  let token = Token.load(tokenId)
  if (token === null) {
    let contract = SimpleToken.bind(address)
    token = new Token(tokenId)
    token.decimals = contract.decimals()
    token.name = contract.name()
    token.symbol = contract.symbol()

    // Set initial supply
    let initialSupply = contract.try_totalSupply()
    token.totalSupply = initialSupply.reverted ? ZERO : initialSupply.value

    // TODO: find a more reliable way to detect Siren-tokens
    let isSirenToken =
      token.name.startsWith("B-") ||
      token.name.startsWith("W-") ||
      token.name.startsWith("LP-")
    if (isSirenToken) {
      token.type = token.name.startsWith("B-")
        ? "B_TOKEN"
        : token.name.startsWith("W-")
        ? "W_TOKEN"
        : "LP_TOKEN"
      token.totalBurned = ZERO
      token.totalMinted = ZERO
      token.totalTransferred = ZERO

      // Register token as data source - only for bTokens and wTokens
      SimpleTokenTemplate.create(address)

      // Link to Market
      token.market = contract.deployer().toHexString()
    }

    token.save()
  }

  return token as Token
}

export function handleApproval(event: Approval): void {
  let token = findOrCreateToken(event.address)

  let approval = new TokenApproval(getId(event))
  approval.token = token.id
  approval.amount = event.params.value
  approval.sender = event.transaction.from
  approval.eventType = "Approval"
  approval.block = event.block.number
  approval.timestamp = event.block.timestamp
  approval.owner = event.params.owner
  approval.spender = event.params.spender

  approval.save()
}

const GENESIS_ADDRESS = "0x0000000000000000000000000000000000000000"

export function handleTransfer(event: Transfer): void {
  let token = findOrCreateToken(event.address)
  let amount = event.params.value

  let isBurn = event.params.to.toHex() == GENESIS_ADDRESS
  let isMint = event.params.from.toHex() == GENESIS_ADDRESS
  let isTransfer = !isBurn && !isMint

  let eventId = getId(event)

  if (isBurn) {
    let burn = new TokenBurn(eventId)
    burn.token = token.id
    burn.amount = amount
    burn.sender = event.transaction.from
    burn.eventType = "Burn"
    burn.block = event.block.number
    burn.timestamp = event.block.timestamp
    burn.burner = event.params.from
    burn.save()

    token.totalSupply = token.totalSupply.minus(amount)
    token.totalBurned = token.totalBurned.plus(amount)
    token.save()
  } else if (isMint) {
    let mint = new TokenMint(eventId)
    mint.token = token.id
    mint.amount = amount
    mint.sender = event.transaction.from
    mint.eventType = "Mint"
    mint.block = event.block.number
    mint.timestamp = event.block.timestamp
    mint.minter = event.transaction.from
    mint.destination = event.params.to
    mint.save()

    token.totalSupply = token.totalSupply.plus(amount)
    token.totalMinted = token.totalMinted.plus(amount)
    token.save()
  } else {
    let transfer = new TokenTransfer(eventId)
    transfer.token = token.id
    transfer.amount = amount
    transfer.sender = event.transaction.from
    transfer.eventType = "Transfer"
    transfer.block = event.block.number
    transfer.timestamp = event.block.timestamp
    transfer.from = event.params.from
    transfer.to = event.params.to
    transfer.save()

    token.totalTransferred = token.totalTransferred.plus(amount)
    token.save()
  }

  // Updates balances of accounts
  if (isTransfer || isBurn) {
    let sourceAccount = getOrCreateAccount(event.params.from)

    let accountBalance = decreaseAccountBalance(
      sourceAccount,
      token as Token,
      amount,
    )
    accountBalance.block = event.block.number
    accountBalance.modified = event.block.timestamp
    accountBalance.transaction = event.transaction.hash

    sourceAccount.save()
    accountBalance.save()

    // To provide information about evolution of account balances
    saveAccountBalanceSnapshot(accountBalance, eventId, event)
  }

  if (isTransfer || isMint) {
    let destinationAccount = getOrCreateAccount(event.params.to)

    let accountBalance = increaseAccountBalance(
      destinationAccount,
      token as Token,
      amount,
    )
    accountBalance.block = event.block.number
    accountBalance.modified = event.block.timestamp
    accountBalance.transaction = event.transaction.hash

    destinationAccount.save()
    accountBalance.save()

    // To provide information about evolution of account balances
    saveAccountBalanceSnapshot(accountBalance, eventId, event)
  }
}
