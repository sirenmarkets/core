// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import {
  ethereum,
  JSONValue,
  TypedMap,
  Entity,
  Bytes,
  Address,
  BigInt,
} from "@graphprotocol/graph-ts"

export class AMMInitialized extends ethereum.Event {
  get params(): AMMInitialized__Params {
    return new AMMInitialized__Params(this)
  }
}

export class AMMInitialized__Params {
  _event: AMMInitialized

  constructor(event: AMMInitialized) {
    this._event = event
  }

  get lpToken(): Address {
    return this._event.parameters[0].value.toAddress()
  }

  get priceOracle(): Address {
    return this._event.parameters[1].value.toAddress()
  }
}

export class BTokensBought extends ethereum.Event {
  get params(): BTokensBought__Params {
    return new BTokensBought__Params(this)
  }
}

export class BTokensBought__Params {
  _event: BTokensBought

  constructor(event: BTokensBought) {
    this._event = event
  }

  get buyer(): Address {
    return this._event.parameters[0].value.toAddress()
  }

  get bTokensBought(): BigInt {
    return this._event.parameters[1].value.toBigInt()
  }

  get collateralPaid(): BigInt {
    return this._event.parameters[2].value.toBigInt()
  }
}

export class BTokensSold extends ethereum.Event {
  get params(): BTokensSold__Params {
    return new BTokensSold__Params(this)
  }
}

export class BTokensSold__Params {
  _event: BTokensSold

  constructor(event: BTokensSold) {
    this._event = event
  }

  get seller(): Address {
    return this._event.parameters[0].value.toAddress()
  }

  get bTokensSold(): BigInt {
    return this._event.parameters[1].value.toBigInt()
  }

  get collateralPaid(): BigInt {
    return this._event.parameters[2].value.toBigInt()
  }
}

export class CodeAddressUpdated extends ethereum.Event {
  get params(): CodeAddressUpdated__Params {
    return new CodeAddressUpdated__Params(this)
  }
}

export class CodeAddressUpdated__Params {
  _event: CodeAddressUpdated

  constructor(event: CodeAddressUpdated) {
    this._event = event
  }

  get newAddress(): Address {
    return this._event.parameters[0].value.toAddress()
  }
}

export class DepositAllowedUpdated extends ethereum.Event {
  get params(): DepositAllowedUpdated__Params {
    return new DepositAllowedUpdated__Params(this)
  }
}

export class DepositAllowedUpdated__Params {
  _event: DepositAllowedUpdated

  constructor(event: DepositAllowedUpdated) {
    this._event = event
  }

  get lpAddress(): Address {
    return this._event.parameters[0].value.toAddress()
  }

  get allowed(): boolean {
    return this._event.parameters[1].value.toBoolean()
  }
}

export class EnforceDepositLimitsUpdated extends ethereum.Event {
  get params(): EnforceDepositLimitsUpdated__Params {
    return new EnforceDepositLimitsUpdated__Params(this)
  }
}

export class EnforceDepositLimitsUpdated__Params {
  _event: EnforceDepositLimitsUpdated

  constructor(event: EnforceDepositLimitsUpdated) {
    this._event = event
  }

  get isEnforced(): boolean {
    return this._event.parameters[0].value.toBoolean()
  }

  get globalLimit(): BigInt {
    return this._event.parameters[1].value.toBigInt()
  }
}

export class LpTokensBurned extends ethereum.Event {
  get params(): LpTokensBurned__Params {
    return new LpTokensBurned__Params(this)
  }
}

export class LpTokensBurned__Params {
  _event: LpTokensBurned

  constructor(event: LpTokensBurned) {
    this._event = event
  }

  get redeemer(): Address {
    return this._event.parameters[0].value.toAddress()
  }

  get collateralRemoved(): BigInt {
    return this._event.parameters[1].value.toBigInt()
  }

  get paymentRemoved(): BigInt {
    return this._event.parameters[2].value.toBigInt()
  }

  get lpTokensBurned(): BigInt {
    return this._event.parameters[3].value.toBigInt()
  }
}

export class LpTokensMinted extends ethereum.Event {
  get params(): LpTokensMinted__Params {
    return new LpTokensMinted__Params(this)
  }
}

export class LpTokensMinted__Params {
  _event: LpTokensMinted

  constructor(event: LpTokensMinted) {
    this._event = event
  }

  get minter(): Address {
    return this._event.parameters[0].value.toAddress()
  }

  get collateralAdded(): BigInt {
    return this._event.parameters[1].value.toBigInt()
  }

  get lpTokensMinted(): BigInt {
    return this._event.parameters[2].value.toBigInt()
  }
}

export class OwnershipTransferred extends ethereum.Event {
  get params(): OwnershipTransferred__Params {
    return new OwnershipTransferred__Params(this)
  }
}

export class OwnershipTransferred__Params {
  _event: OwnershipTransferred

  constructor(event: OwnershipTransferred) {
    this._event = event
  }

  get previousOwner(): Address {
    return this._event.parameters[0].value.toAddress()
  }

  get newOwner(): Address {
    return this._event.parameters[1].value.toAddress()
  }
}

export class VolatilityFactorUpdated extends ethereum.Event {
  get params(): VolatilityFactorUpdated__Params {
    return new VolatilityFactorUpdated__Params(this)
  }
}

export class VolatilityFactorUpdated__Params {
  _event: VolatilityFactorUpdated

  constructor(event: VolatilityFactorUpdated) {
    this._event = event
  }

  get newVolatilityFactor(): BigInt {
    return this._event.parameters[0].value.toBigInt()
  }
}

export class WTokensBought extends ethereum.Event {
  get params(): WTokensBought__Params {
    return new WTokensBought__Params(this)
  }
}

export class WTokensBought__Params {
  _event: WTokensBought

  constructor(event: WTokensBought) {
    this._event = event
  }

  get buyer(): Address {
    return this._event.parameters[0].value.toAddress()
  }

  get wTokensBought(): BigInt {
    return this._event.parameters[1].value.toBigInt()
  }

  get collateralPaid(): BigInt {
    return this._event.parameters[2].value.toBigInt()
  }
}

export class WTokensSold extends ethereum.Event {
  get params(): WTokensSold__Params {
    return new WTokensSold__Params(this)
  }
}

export class WTokensSold__Params {
  _event: WTokensSold

  constructor(event: WTokensSold) {
    this._event = event
  }

  get seller(): Address {
    return this._event.parameters[0].value.toAddress()
  }

  get wTokensSold(): BigInt {
    return this._event.parameters[1].value.toBigInt()
  }

  get collateralPaid(): BigInt {
    return this._event.parameters[2].value.toBigInt()
  }
}

export class MinterAmm__collateralDepositLimitsResult {
  value0: boolean
  value1: BigInt

  constructor(value0: boolean, value1: BigInt) {
    this.value0 = value0
    this.value1 = value1
  }

  toMap(): TypedMap<string, ethereum.Value> {
    let map = new TypedMap<string, ethereum.Value>()
    map.set("value0", ethereum.Value.fromBoolean(this.value0))
    map.set("value1", ethereum.Value.fromUnsignedBigInt(this.value1))
    return map
  }
}

export class MinterAmm__getUnclaimedBalancesResult {
  value0: BigInt
  value1: BigInt

  constructor(value0: BigInt, value1: BigInt) {
    this.value0 = value0
    this.value1 = value1
  }

  toMap(): TypedMap<string, ethereum.Value> {
    let map = new TypedMap<string, ethereum.Value>()
    map.set("value0", ethereum.Value.fromUnsignedBigInt(this.value0))
    map.set("value1", ethereum.Value.fromUnsignedBigInt(this.value1))
    return map
  }
}

export class MinterAmm__getVirtualReservesResult {
  value0: BigInt
  value1: BigInt

  constructor(value0: BigInt, value1: BigInt) {
    this.value0 = value0
    this.value1 = value1
  }

  toMap(): TypedMap<string, ethereum.Value> {
    let map = new TypedMap<string, ethereum.Value>()
    map.set("value0", ethereum.Value.fromUnsignedBigInt(this.value0))
    map.set("value1", ethereum.Value.fromUnsignedBigInt(this.value1))
    return map
  }
}

export class MinterAmm extends ethereum.SmartContract {
  static bind(address: Address): MinterAmm {
    return new MinterAmm("MinterAmm", address)
  }

  assetPair(): Bytes {
    let result = super.call("assetPair", "assetPair():(bytes32)", [])

    return result[0].toBytes()
  }

  try_assetPair(): ethereum.CallResult<Bytes> {
    let result = super.tryCall("assetPair", "assetPair():(bytes32)", [])
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBytes())
  }

  collateralDepositLimits(
    param0: Address,
  ): MinterAmm__collateralDepositLimitsResult {
    let result = super.call(
      "collateralDepositLimits",
      "collateralDepositLimits(address):(bool,uint256)",
      [ethereum.Value.fromAddress(param0)],
    )

    return new MinterAmm__collateralDepositLimitsResult(
      result[0].toBoolean(),
      result[1].toBigInt(),
    )
  }

  try_collateralDepositLimits(
    param0: Address,
  ): ethereum.CallResult<MinterAmm__collateralDepositLimitsResult> {
    let result = super.tryCall(
      "collateralDepositLimits",
      "collateralDepositLimits(address):(bool,uint256)",
      [ethereum.Value.fromAddress(param0)],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(
      new MinterAmm__collateralDepositLimitsResult(
        value[0].toBoolean(),
        value[1].toBigInt(),
      ),
    )
  }

  collateralToken(): Address {
    let result = super.call(
      "collateralToken",
      "collateralToken():(address)",
      [],
    )

    return result[0].toAddress()
  }

  try_collateralToken(): ethereum.CallResult<Address> {
    let result = super.tryCall(
      "collateralToken",
      "collateralToken():(address)",
      [],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toAddress())
  }

  enforceDepositLimits(): boolean {
    let result = super.call(
      "enforceDepositLimits",
      "enforceDepositLimits():(bool)",
      [],
    )

    return result[0].toBoolean()
  }

  try_enforceDepositLimits(): ethereum.CallResult<boolean> {
    let result = super.tryCall(
      "enforceDepositLimits",
      "enforceDepositLimits():(bool)",
      [],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBoolean())
  }

  getLogicAddress(): Address {
    let result = super.call(
      "getLogicAddress",
      "getLogicAddress():(address)",
      [],
    )

    return result[0].toAddress()
  }

  try_getLogicAddress(): ethereum.CallResult<Address> {
    let result = super.tryCall(
      "getLogicAddress",
      "getLogicAddress():(address)",
      [],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toAddress())
  }

  globalDepositLimit(): BigInt {
    let result = super.call(
      "globalDepositLimit",
      "globalDepositLimit():(uint256)",
      [],
    )

    return result[0].toBigInt()
  }

  try_globalDepositLimit(): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "globalDepositLimit",
      "globalDepositLimit():(uint256)",
      [],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }

  lpToken(): Address {
    let result = super.call("lpToken", "lpToken():(address)", [])

    return result[0].toAddress()
  }

  try_lpToken(): ethereum.CallResult<Address> {
    let result = super.tryCall("lpToken", "lpToken():(address)", [])
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toAddress())
  }

  owner(): Address {
    let result = super.call("owner", "owner():(address)", [])

    return result[0].toAddress()
  }

  try_owner(): ethereum.CallResult<Address> {
    let result = super.tryCall("owner", "owner():(address)", [])
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toAddress())
  }

  paymentToken(): Address {
    let result = super.call("paymentToken", "paymentToken():(address)", [])

    return result[0].toAddress()
  }

  try_paymentToken(): ethereum.CallResult<Address> {
    let result = super.tryCall("paymentToken", "paymentToken():(address)", [])
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toAddress())
  }

  proxiableUUID(): Bytes {
    let result = super.call("proxiableUUID", "proxiableUUID():(bytes32)", [])

    return result[0].toBytes()
  }

  try_proxiableUUID(): ethereum.CallResult<Bytes> {
    let result = super.tryCall("proxiableUUID", "proxiableUUID():(bytes32)", [])
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBytes())
  }

  registry(): Address {
    let result = super.call("registry", "registry():(address)", [])

    return result[0].toAddress()
  }

  try_registry(): ethereum.CallResult<Address> {
    let result = super.tryCall("registry", "registry():(address)", [])
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toAddress())
  }

  tradeFeeBasisPoints(): i32 {
    let result = super.call(
      "tradeFeeBasisPoints",
      "tradeFeeBasisPoints():(uint16)",
      [],
    )

    return result[0].toI32()
  }

  try_tradeFeeBasisPoints(): ethereum.CallResult<i32> {
    let result = super.tryCall(
      "tradeFeeBasisPoints",
      "tradeFeeBasisPoints():(uint16)",
      [],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toI32())
  }

  volatilityFactor(): BigInt {
    let result = super.call(
      "volatilityFactor",
      "volatilityFactor():(uint256)",
      [],
    )

    return result[0].toBigInt()
  }

  try_volatilityFactor(): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "volatilityFactor",
      "volatilityFactor():(uint256)",
      [],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }

  getTotalPoolValue(includeUnclaimed: boolean): BigInt {
    let result = super.call(
      "getTotalPoolValue",
      "getTotalPoolValue(bool):(uint256)",
      [ethereum.Value.fromBoolean(includeUnclaimed)],
    )

    return result[0].toBigInt()
  }

  try_getTotalPoolValue(
    includeUnclaimed: boolean,
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "getTotalPoolValue",
      "getTotalPoolValue(bool):(uint256)",
      [ethereum.Value.fromBoolean(includeUnclaimed)],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }

  getUnclaimedBalances(): MinterAmm__getUnclaimedBalancesResult {
    let result = super.call(
      "getUnclaimedBalances",
      "getUnclaimedBalances():(uint256,uint256)",
      [],
    )

    return new MinterAmm__getUnclaimedBalancesResult(
      result[0].toBigInt(),
      result[1].toBigInt(),
    )
  }

  try_getUnclaimedBalances(): ethereum.CallResult<
    MinterAmm__getUnclaimedBalancesResult
  > {
    let result = super.tryCall(
      "getUnclaimedBalances",
      "getUnclaimedBalances():(uint256,uint256)",
      [],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(
      new MinterAmm__getUnclaimedBalancesResult(
        value[0].toBigInt(),
        value[1].toBigInt(),
      ),
    )
  }

  getTokensSaleValue(lpTokenAmount: BigInt): BigInt {
    let result = super.call(
      "getTokensSaleValue",
      "getTokensSaleValue(uint256):(uint256)",
      [ethereum.Value.fromUnsignedBigInt(lpTokenAmount)],
    )

    return result[0].toBigInt()
  }

  try_getTokensSaleValue(lpTokenAmount: BigInt): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "getTokensSaleValue",
      "getTokensSaleValue(uint256):(uint256)",
      [ethereum.Value.fromUnsignedBigInt(lpTokenAmount)],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }

  getMarkets(): Array<Address> {
    let result = super.call("getMarkets", "getMarkets():(address[])", [])

    return result[0].toAddressArray()
  }

  try_getMarkets(): ethereum.CallResult<Array<Address>> {
    let result = super.tryCall("getMarkets", "getMarkets():(address[])", [])
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toAddressArray())
  }

  getMarket(marketIndex: BigInt): Address {
    let result = super.call("getMarket", "getMarket(uint256):(address)", [
      ethereum.Value.fromUnsignedBigInt(marketIndex),
    ])

    return result[0].toAddress()
  }

  try_getMarket(marketIndex: BigInt): ethereum.CallResult<Address> {
    let result = super.tryCall("getMarket", "getMarket(uint256):(address)", [
      ethereum.Value.fromUnsignedBigInt(marketIndex),
    ])
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toAddress())
  }

  getVirtualReserves(market: Address): MinterAmm__getVirtualReservesResult {
    let result = super.call(
      "getVirtualReserves",
      "getVirtualReserves(address):(uint256,uint256)",
      [ethereum.Value.fromAddress(market)],
    )

    return new MinterAmm__getVirtualReservesResult(
      result[0].toBigInt(),
      result[1].toBigInt(),
    )
  }

  try_getVirtualReserves(
    market: Address,
  ): ethereum.CallResult<MinterAmm__getVirtualReservesResult> {
    let result = super.tryCall(
      "getVirtualReserves",
      "getVirtualReserves(address):(uint256,uint256)",
      [ethereum.Value.fromAddress(market)],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(
      new MinterAmm__getVirtualReservesResult(
        value[0].toBigInt(),
        value[1].toBigInt(),
      ),
    )
  }

  getCurrentCollateralPrice(): BigInt {
    let result = super.call(
      "getCurrentCollateralPrice",
      "getCurrentCollateralPrice():(uint256)",
      [],
    )

    return result[0].toBigInt()
  }

  try_getCurrentCollateralPrice(): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "getCurrentCollateralPrice",
      "getCurrentCollateralPrice():(uint256)",
      [],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }

  getPriceForMarket(market: Address): BigInt {
    let result = super.call(
      "getPriceForMarket",
      "getPriceForMarket(address):(uint256)",
      [ethereum.Value.fromAddress(market)],
    )

    return result[0].toBigInt()
  }

  try_getPriceForMarket(market: Address): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "getPriceForMarket",
      "getPriceForMarket(address):(uint256)",
      [ethereum.Value.fromAddress(market)],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }

  calcPrice(
    timeUntilExpiry: BigInt,
    strike: BigInt,
    currentPrice: BigInt,
    volatility: BigInt,
  ): BigInt {
    let result = super.call(
      "calcPrice",
      "calcPrice(uint256,uint256,uint256,uint256):(uint256)",
      [
        ethereum.Value.fromUnsignedBigInt(timeUntilExpiry),
        ethereum.Value.fromUnsignedBigInt(strike),
        ethereum.Value.fromUnsignedBigInt(currentPrice),
        ethereum.Value.fromUnsignedBigInt(volatility),
      ],
    )

    return result[0].toBigInt()
  }

  try_calcPrice(
    timeUntilExpiry: BigInt,
    strike: BigInt,
    currentPrice: BigInt,
    volatility: BigInt,
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "calcPrice",
      "calcPrice(uint256,uint256,uint256,uint256):(uint256)",
      [
        ethereum.Value.fromUnsignedBigInt(timeUntilExpiry),
        ethereum.Value.fromUnsignedBigInt(strike),
        ethereum.Value.fromUnsignedBigInt(currentPrice),
        ethereum.Value.fromUnsignedBigInt(volatility),
      ],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }

  bTokenBuy(
    marketIndex: BigInt,
    bTokenAmount: BigInt,
    collateralMaximum: BigInt,
  ): BigInt {
    let result = super.call(
      "bTokenBuy",
      "bTokenBuy(uint256,uint256,uint256):(uint256)",
      [
        ethereum.Value.fromUnsignedBigInt(marketIndex),
        ethereum.Value.fromUnsignedBigInt(bTokenAmount),
        ethereum.Value.fromUnsignedBigInt(collateralMaximum),
      ],
    )

    return result[0].toBigInt()
  }

  try_bTokenBuy(
    marketIndex: BigInt,
    bTokenAmount: BigInt,
    collateralMaximum: BigInt,
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "bTokenBuy",
      "bTokenBuy(uint256,uint256,uint256):(uint256)",
      [
        ethereum.Value.fromUnsignedBigInt(marketIndex),
        ethereum.Value.fromUnsignedBigInt(bTokenAmount),
        ethereum.Value.fromUnsignedBigInt(collateralMaximum),
      ],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }

  bTokenSell(
    marketIndex: BigInt,
    bTokenAmount: BigInt,
    collateralMinimum: BigInt,
  ): BigInt {
    let result = super.call(
      "bTokenSell",
      "bTokenSell(uint256,uint256,uint256):(uint256)",
      [
        ethereum.Value.fromUnsignedBigInt(marketIndex),
        ethereum.Value.fromUnsignedBigInt(bTokenAmount),
        ethereum.Value.fromUnsignedBigInt(collateralMinimum),
      ],
    )

    return result[0].toBigInt()
  }

  try_bTokenSell(
    marketIndex: BigInt,
    bTokenAmount: BigInt,
    collateralMinimum: BigInt,
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "bTokenSell",
      "bTokenSell(uint256,uint256,uint256):(uint256)",
      [
        ethereum.Value.fromUnsignedBigInt(marketIndex),
        ethereum.Value.fromUnsignedBigInt(bTokenAmount),
        ethereum.Value.fromUnsignedBigInt(collateralMinimum),
      ],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }

  bTokenGetCollateralIn(market: Address, bTokenAmount: BigInt): BigInt {
    let result = super.call(
      "bTokenGetCollateralIn",
      "bTokenGetCollateralIn(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(market),
        ethereum.Value.fromUnsignedBigInt(bTokenAmount),
      ],
    )

    return result[0].toBigInt()
  }

  try_bTokenGetCollateralIn(
    market: Address,
    bTokenAmount: BigInt,
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "bTokenGetCollateralIn",
      "bTokenGetCollateralIn(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(market),
        ethereum.Value.fromUnsignedBigInt(bTokenAmount),
      ],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }

  bTokenGetCollateralOut(market: Address, bTokenAmount: BigInt): BigInt {
    let result = super.call(
      "bTokenGetCollateralOut",
      "bTokenGetCollateralOut(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(market),
        ethereum.Value.fromUnsignedBigInt(bTokenAmount),
      ],
    )

    return result[0].toBigInt()
  }

  try_bTokenGetCollateralOut(
    market: Address,
    bTokenAmount: BigInt,
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "bTokenGetCollateralOut",
      "bTokenGetCollateralOut(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(market),
        ethereum.Value.fromUnsignedBigInt(bTokenAmount),
      ],
    )
    if (result.reverted) {
      return new ethereum.CallResult()
    }
    let value = result.value
    return ethereum.CallResult.fromValue(value[0].toBigInt())
  }
}

export class RenounceOwnershipCall extends ethereum.Call {
  get inputs(): RenounceOwnershipCall__Inputs {
    return new RenounceOwnershipCall__Inputs(this)
  }

  get outputs(): RenounceOwnershipCall__Outputs {
    return new RenounceOwnershipCall__Outputs(this)
  }
}

export class RenounceOwnershipCall__Inputs {
  _call: RenounceOwnershipCall

  constructor(call: RenounceOwnershipCall) {
    this._call = call
  }
}

export class RenounceOwnershipCall__Outputs {
  _call: RenounceOwnershipCall

  constructor(call: RenounceOwnershipCall) {
    this._call = call
  }
}

export class TransferOwnershipCall extends ethereum.Call {
  get inputs(): TransferOwnershipCall__Inputs {
    return new TransferOwnershipCall__Inputs(this)
  }

  get outputs(): TransferOwnershipCall__Outputs {
    return new TransferOwnershipCall__Outputs(this)
  }
}

export class TransferOwnershipCall__Inputs {
  _call: TransferOwnershipCall

  constructor(call: TransferOwnershipCall) {
    this._call = call
  }

  get newOwner(): Address {
    return this._call.inputValues[0].value.toAddress()
  }
}

export class TransferOwnershipCall__Outputs {
  _call: TransferOwnershipCall

  constructor(call: TransferOwnershipCall) {
    this._call = call
  }
}

export class InitializeCall extends ethereum.Call {
  get inputs(): InitializeCall__Inputs {
    return new InitializeCall__Inputs(this)
  }

  get outputs(): InitializeCall__Outputs {
    return new InitializeCall__Outputs(this)
  }
}

export class InitializeCall__Inputs {
  _call: InitializeCall

  constructor(call: InitializeCall) {
    this._call = call
  }

  get _registry(): Address {
    return this._call.inputValues[0].value.toAddress()
  }

  get _priceOracle(): Address {
    return this._call.inputValues[1].value.toAddress()
  }

  get _paymentToken(): Address {
    return this._call.inputValues[2].value.toAddress()
  }

  get _collateralToken(): Address {
    return this._call.inputValues[3].value.toAddress()
  }

  get _tokenImplementation(): Address {
    return this._call.inputValues[4].value.toAddress()
  }

  get _tradeFeeBasisPoints(): i32 {
    return this._call.inputValues[5].value.toI32()
  }

  get _shouldInvertOraclePrice(): boolean {
    return this._call.inputValues[6].value.toBoolean()
  }
}

export class InitializeCall__Outputs {
  _call: InitializeCall

  constructor(call: InitializeCall) {
    this._call = call
  }
}

export class SetEnforceDepositLimitsCall extends ethereum.Call {
  get inputs(): SetEnforceDepositLimitsCall__Inputs {
    return new SetEnforceDepositLimitsCall__Inputs(this)
  }

  get outputs(): SetEnforceDepositLimitsCall__Outputs {
    return new SetEnforceDepositLimitsCall__Outputs(this)
  }
}

export class SetEnforceDepositLimitsCall__Inputs {
  _call: SetEnforceDepositLimitsCall

  constructor(call: SetEnforceDepositLimitsCall) {
    this._call = call
  }

  get _enforceDepositLimits(): boolean {
    return this._call.inputValues[0].value.toBoolean()
  }

  get _globalDepositLimit(): BigInt {
    return this._call.inputValues[1].value.toBigInt()
  }
}

export class SetEnforceDepositLimitsCall__Outputs {
  _call: SetEnforceDepositLimitsCall

  constructor(call: SetEnforceDepositLimitsCall) {
    this._call = call
  }
}

export class SetCapitalDepositLimitCall extends ethereum.Call {
  get inputs(): SetCapitalDepositLimitCall__Inputs {
    return new SetCapitalDepositLimitCall__Inputs(this)
  }

  get outputs(): SetCapitalDepositLimitCall__Outputs {
    return new SetCapitalDepositLimitCall__Outputs(this)
  }
}

export class SetCapitalDepositLimitCall__Inputs {
  _call: SetCapitalDepositLimitCall

  constructor(call: SetCapitalDepositLimitCall) {
    this._call = call
  }

  get lpAddresses(): Array<Address> {
    return this._call.inputValues[0].value.toAddressArray()
  }

  get allowedToDeposit(): Array<boolean> {
    return this._call.inputValues[1].value.toBooleanArray()
  }
}

export class SetCapitalDepositLimitCall__Outputs {
  _call: SetCapitalDepositLimitCall

  constructor(call: SetCapitalDepositLimitCall) {
    this._call = call
  }
}

export class SetVolatilityFactorCall extends ethereum.Call {
  get inputs(): SetVolatilityFactorCall__Inputs {
    return new SetVolatilityFactorCall__Inputs(this)
  }

  get outputs(): SetVolatilityFactorCall__Outputs {
    return new SetVolatilityFactorCall__Outputs(this)
  }
}

export class SetVolatilityFactorCall__Inputs {
  _call: SetVolatilityFactorCall

  constructor(call: SetVolatilityFactorCall) {
    this._call = call
  }

  get _volatilityFactor(): BigInt {
    return this._call.inputValues[0].value.toBigInt()
  }
}

export class SetVolatilityFactorCall__Outputs {
  _call: SetVolatilityFactorCall

  constructor(call: SetVolatilityFactorCall) {
    this._call = call
  }
}

export class updateAmmImplementationCall extends ethereum.Call {
  get inputs(): updateAmmImplementationCall__Inputs {
    return new updateAmmImplementationCall__Inputs(this)
  }

  get outputs(): updateAmmImplementationCall__Outputs {
    return new updateAmmImplementationCall__Outputs(this)
  }
}

export class updateAmmImplementationCall__Inputs {
  _call: updateAmmImplementationCall

  constructor(call: updateAmmImplementationCall) {
    this._call = call
  }

  get newAmmImplementation(): Address {
    return this._call.inputValues[0].value.toAddress()
  }
}

export class updateAmmImplementationCall__Outputs {
  _call: updateAmmImplementationCall

  constructor(call: updateAmmImplementationCall) {
    this._call = call
  }
}

export class ProvideCapitalCall extends ethereum.Call {
  get inputs(): ProvideCapitalCall__Inputs {
    return new ProvideCapitalCall__Inputs(this)
  }

  get outputs(): ProvideCapitalCall__Outputs {
    return new ProvideCapitalCall__Outputs(this)
  }
}

export class ProvideCapitalCall__Inputs {
  _call: ProvideCapitalCall

  constructor(call: ProvideCapitalCall) {
    this._call = call
  }

  get collateralAmount(): BigInt {
    return this._call.inputValues[0].value.toBigInt()
  }

  get lpTokenMinimum(): BigInt {
    return this._call.inputValues[1].value.toBigInt()
  }
}

export class ProvideCapitalCall__Outputs {
  _call: ProvideCapitalCall

  constructor(call: ProvideCapitalCall) {
    this._call = call
  }
}

export class WithdrawCapitalCall extends ethereum.Call {
  get inputs(): WithdrawCapitalCall__Inputs {
    return new WithdrawCapitalCall__Inputs(this)
  }

  get outputs(): WithdrawCapitalCall__Outputs {
    return new WithdrawCapitalCall__Outputs(this)
  }
}

export class WithdrawCapitalCall__Inputs {
  _call: WithdrawCapitalCall

  constructor(call: WithdrawCapitalCall) {
    this._call = call
  }

  get lpTokenAmount(): BigInt {
    return this._call.inputValues[0].value.toBigInt()
  }

  get sellTokens(): boolean {
    return this._call.inputValues[1].value.toBoolean()
  }

  get collateralMinimum(): BigInt {
    return this._call.inputValues[2].value.toBigInt()
  }
}

export class WithdrawCapitalCall__Outputs {
  _call: WithdrawCapitalCall

  constructor(call: WithdrawCapitalCall) {
    this._call = call
  }
}

export class ClaimAllExpiredTokensCall extends ethereum.Call {
  get inputs(): ClaimAllExpiredTokensCall__Inputs {
    return new ClaimAllExpiredTokensCall__Inputs(this)
  }

  get outputs(): ClaimAllExpiredTokensCall__Outputs {
    return new ClaimAllExpiredTokensCall__Outputs(this)
  }
}

export class ClaimAllExpiredTokensCall__Inputs {
  _call: ClaimAllExpiredTokensCall

  constructor(call: ClaimAllExpiredTokensCall) {
    this._call = call
  }
}

export class ClaimAllExpiredTokensCall__Outputs {
  _call: ClaimAllExpiredTokensCall

  constructor(call: ClaimAllExpiredTokensCall) {
    this._call = call
  }
}

export class ClaimExpiredTokensCall extends ethereum.Call {
  get inputs(): ClaimExpiredTokensCall__Inputs {
    return new ClaimExpiredTokensCall__Inputs(this)
  }

  get outputs(): ClaimExpiredTokensCall__Outputs {
    return new ClaimExpiredTokensCall__Outputs(this)
  }
}

export class ClaimExpiredTokensCall__Inputs {
  _call: ClaimExpiredTokensCall

  constructor(call: ClaimExpiredTokensCall) {
    this._call = call
  }

  get optionMarket(): Address {
    return this._call.inputValues[0].value.toAddress()
  }

  get wTokenBalance(): BigInt {
    return this._call.inputValues[1].value.toBigInt()
  }
}

export class ClaimExpiredTokensCall__Outputs {
  _call: ClaimExpiredTokensCall

  constructor(call: ClaimExpiredTokensCall) {
    this._call = call
  }
}

export class BTokenBuyCall extends ethereum.Call {
  get inputs(): BTokenBuyCall__Inputs {
    return new BTokenBuyCall__Inputs(this)
  }

  get outputs(): BTokenBuyCall__Outputs {
    return new BTokenBuyCall__Outputs(this)
  }
}

export class BTokenBuyCall__Inputs {
  _call: BTokenBuyCall

  constructor(call: BTokenBuyCall) {
    this._call = call
  }

  get marketIndex(): BigInt {
    return this._call.inputValues[0].value.toBigInt()
  }

  get bTokenAmount(): BigInt {
    return this._call.inputValues[1].value.toBigInt()
  }

  get collateralMaximum(): BigInt {
    return this._call.inputValues[2].value.toBigInt()
  }
}

export class BTokenBuyCall__Outputs {
  _call: BTokenBuyCall

  constructor(call: BTokenBuyCall) {
    this._call = call
  }

  get value0(): BigInt {
    return this._call.outputValues[0].value.toBigInt()
  }
}

export class BTokenSellCall extends ethereum.Call {
  get inputs(): BTokenSellCall__Inputs {
    return new BTokenSellCall__Inputs(this)
  }

  get outputs(): BTokenSellCall__Outputs {
    return new BTokenSellCall__Outputs(this)
  }
}

export class BTokenSellCall__Inputs {
  _call: BTokenSellCall

  constructor(call: BTokenSellCall) {
    this._call = call
  }

  get marketIndex(): BigInt {
    return this._call.inputValues[0].value.toBigInt()
  }

  get bTokenAmount(): BigInt {
    return this._call.inputValues[1].value.toBigInt()
  }

  get collateralMinimum(): BigInt {
    return this._call.inputValues[2].value.toBigInt()
  }
}

export class BTokenSellCall__Outputs {
  _call: BTokenSellCall

  constructor(call: BTokenSellCall) {
    this._call = call
  }

  get value0(): BigInt {
    return this._call.outputValues[0].value.toBigInt()
  }
}
