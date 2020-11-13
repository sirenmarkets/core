import { BigInt, DataSourceContext } from "@graphprotocol/graph-ts"
import {
  AmmCreated,
  CodeAddressUpdated,
  MarketCreated,
  MarketDestroyed,
  MarketImplementationUpdated,
  OwnershipTransferred,
  TokenImplementationUpdated,
  TokensRecovered,
} from "../../generated/MarketsRegistry/MarketsRegistry"
import { Market, Amm } from "../../generated/schema"
import {
  Market as MarketTemplate,
  Amm as AmmTemplate,
} from "../../generated/templates"

export function handleCodeAddressUpdated(event: CodeAddressUpdated): void {}

export function handleMarketCreated(event: MarketCreated): void {
  // instruct the graph-node that to index the new Market
  let context = new DataSourceContext()

  // set some data on the context which will be used in the market and amm mappings
  context.setBigInt("marketIndex", event.params.marketIndex)
  MarketTemplate.createWithContext(event.params.newAddress, context)
}

export function handleAmmCreated(event: AmmCreated): void {
  // instruct the graph-node that to index the new Amm
  AmmTemplate.create(event.params.amm)
}

export function handleMarketDestroyed(event: MarketDestroyed): void {}

export function handleMarketImplementationUpdated(
  event: MarketImplementationUpdated,
): void {}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

export function handleTokenImplementationUpdated(
  event: TokenImplementationUpdated,
): void {}

export function handleTokensRecovered(event: TokensRecovered): void {}
