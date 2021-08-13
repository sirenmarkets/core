import { Address } from "@graphprotocol/graph-ts"
import {
  Approval,
  Transfer,
  SimpleToken,
} from "../../generated/templates/SimpleToken/SimpleToken"
import {
  ERC20Token,
  ERC20TokenApproval,
  ERC20TokenTransfer,
  ERC20TokenMint,
  ERC20TokenBurn,
} from "../../generated/schema"
import { SimpleToken as SimpleTokenTemplate } from "../../generated/templates"
import { getId } from "./helpers/transaction"
import {
  decreaseAccountBalance,
  getOrCreateAccount,
  increaseERC20AccountBalance,
  saveERC20AccountBalanceSnapshot,
} from "./account"

import { ZERO } from "./helpers/number"

export function findOrCreateToken(address: Address): ERC20Token {
  let tokenId = address.toHexString()
  let token = ERC20Token.load(tokenId)
  if (token === null) {
    let contract = SimpleToken.bind(address)
    token = new ERC20Token(tokenId)
    token.decimals = contract.decimals()
    token.name = contract.name()
    token.symbol = contract.symbol()

    // Set initial supply
    let initialSupply = contract.try_totalSupply()
    token.totalSupply = initialSupply.reverted ? ZERO : initialSupply.value

    // TODO: find a more reliable way to detect Siren-tokens
    let isSirenToken = token.name.startsWith("LP-")
    if (isSirenToken) {
      token.type = "LP_TOKEN"
      token.totalBurned = ZERO
      token.totalMinted = ZERO
      token.totalTransferred = ZERO

      // Register token as data source so the graph will pick up future events on this SimpleToken
      SimpleTokenTemplate.create(address)
    }

    token.save()
  }

  return token as ERC20Token
}

export function handleApproval(event: Approval): void {
  let token = findOrCreateToken(event.address)

  let approval = new ERC20TokenApproval(getId(event))
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
    let burn = new ERC20TokenBurn(eventId)
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
    let mint = new ERC20TokenMint(eventId)
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
    let transfer = new ERC20TokenTransfer(eventId)
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
      token as ERC20Token,
      amount,
    )
    accountBalance.block = event.block.number
    accountBalance.modified = event.block.timestamp
    accountBalance.transaction = event.transaction.hash

    sourceAccount.save()
    accountBalance.save()

    // To provide information about evolution of account balances
    saveERC20AccountBalanceSnapshot(accountBalance, eventId, event)
  }

  if (isTransfer || isMint) {
    let destinationAccount = getOrCreateAccount(event.params.to)

    let accountBalance = increaseERC20AccountBalance(
      destinationAccount,
      token as ERC20Token,
      amount,
    )
    accountBalance.block = event.block.number
    accountBalance.modified = event.block.timestamp
    accountBalance.transaction = event.transaction.hash

    destinationAccount.save()
    accountBalance.save()

    // To provide information about evolution of account balances
    saveERC20AccountBalanceSnapshot(accountBalance, eventId, event)
  }
}
