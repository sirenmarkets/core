import { Bytes, BigInt, ethereum } from "@graphprotocol/graph-ts"

import {
  Account,
  ERC20AccountBalance,
  ERC20AccountBalanceSnapshot,
  ERC20Token,
} from "../../generated/schema"

import { ZERO } from "./helpers/number"

export function getOrCreateAccount(accountAddress: Bytes): Account {
  let accountId = accountAddress.toHex()
  let existingAccount = Account.load(accountId)

  if (existingAccount != null) {
    return existingAccount as Account
  }

  let newAccount = new Account(accountId)
  newAccount.address = accountAddress

  return newAccount
}

function getOrCreateERC20AccountBalance(
  account: Account,
  token: ERC20Token,
): ERC20AccountBalance {
  let balanceId = account.id + "-" + token.id
  let previousBalance = ERC20AccountBalance.load(balanceId)

  if (previousBalance != null) {
    return previousBalance as ERC20AccountBalance
  }

  let newBalance = new ERC20AccountBalance(balanceId)
  newBalance.account = account.id
  newBalance.token = token.id
  newBalance.amount = ZERO

  return newBalance
}

export function increaseERC20AccountBalance(
  account: Account,
  token: ERC20Token,
  amount: BigInt,
): ERC20AccountBalance {
  let balance = getOrCreateERC20AccountBalance(account, token)
  balance.amount = balance.amount.plus(amount)

  return balance
}

export function decreaseAccountBalance(
  account: Account,
  token: ERC20Token,
  amount: BigInt,
): ERC20AccountBalance {
  let balance = getOrCreateERC20AccountBalance(account, token)
  balance.amount = balance.amount.minus(amount)

  return balance
}

export function saveERC20AccountBalanceSnapshot(
  balance: ERC20AccountBalance,
  eventId: string,
  event: ethereum.Event,
): void {
  let snapshot = new ERC20AccountBalanceSnapshot(
    balance.id + "-" + event.block.timestamp.toString(),
  )
  snapshot.account = balance.account
  snapshot.token = balance.token
  snapshot.amount = balance.amount

  snapshot.block = event.block.number
  snapshot.transaction = event.transaction.hash
  snapshot.timestamp = event.block.timestamp

  snapshot.event = eventId

  snapshot.save()
}
