// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import {
  ethereum,
  JSONValue,
  TypedMap,
  Entity,
  Bytes,
  Address,
  BigInt
} from "@graphprotocol/graph-ts";

export class CodeAddressUpdated extends ethereum.Event {
  get params(): CodeAddressUpdated__Params {
    return new CodeAddressUpdated__Params(this);
  }
}

export class CodeAddressUpdated__Params {
  _event: CodeAddressUpdated;

  constructor(event: CodeAddressUpdated) {
    this._event = event;
  }

  get newAddress(): Address {
    return this._event.parameters[0].value.toAddress();
  }
}

export class CollateralLocked extends ethereum.Event {
  get params(): CollateralLocked__Params {
    return new CollateralLocked__Params(this);
  }
}

export class CollateralLocked__Params {
  _event: CollateralLocked;

  constructor(event: CollateralLocked) {
    this._event = event;
  }

  get ammAddress(): Address {
    return this._event.parameters[0].value.toAddress();
  }

  get expirationDate(): BigInt {
    return this._event.parameters[1].value.toBigInt();
  }

  get collateralAmount(): BigInt {
    return this._event.parameters[2].value.toBigInt();
  }

  get wTokenAmount(): BigInt {
    return this._event.parameters[3].value.toBigInt();
  }
}

export class LpSharesRedeemed extends ethereum.Event {
  get params(): LpSharesRedeemed__Params {
    return new LpSharesRedeemed__Params(this);
  }
}

export class LpSharesRedeemed__Params {
  _event: LpSharesRedeemed;

  constructor(event: LpSharesRedeemed) {
    this._event = event;
  }

  get ammAddress(): Address {
    return this._event.parameters[0].value.toAddress();
  }

  get redeemer(): Address {
    return this._event.parameters[1].value.toAddress();
  }

  get expirationDate(): BigInt {
    return this._event.parameters[2].value.toBigInt();
  }

  get numShares(): BigInt {
    return this._event.parameters[3].value.toBigInt();
  }

  get collateralAmount(): BigInt {
    return this._event.parameters[4].value.toBigInt();
  }
}

export class OwnershipTransferred extends ethereum.Event {
  get params(): OwnershipTransferred__Params {
    return new OwnershipTransferred__Params(this);
  }
}

export class OwnershipTransferred__Params {
  _event: OwnershipTransferred;

  constructor(event: OwnershipTransferred) {
    this._event = event;
  }

  get previousOwner(): Address {
    return this._event.parameters[0].value.toAddress();
  }

  get newOwner(): Address {
    return this._event.parameters[1].value.toAddress();
  }
}

export class WTokensLocked extends ethereum.Event {
  get params(): WTokensLocked__Params {
    return new WTokensLocked__Params(this);
  }
}

export class WTokensLocked__Params {
  _event: WTokensLocked;

  constructor(event: WTokensLocked) {
    this._event = event;
  }

  get ammAddress(): Address {
    return this._event.parameters[0].value.toAddress();
  }

  get redeemer(): Address {
    return this._event.parameters[1].value.toAddress();
  }

  get expirationDate(): BigInt {
    return this._event.parameters[2].value.toBigInt();
  }

  get wTokenAmount(): BigInt {
    return this._event.parameters[3].value.toBigInt();
  }

  get lpSharesMinted(): BigInt {
    return this._event.parameters[4].value.toBigInt();
  }
}

export class WTokenVault extends ethereum.SmartContract {
  static bind(address: Address): WTokenVault {
    return new WTokenVault("WTokenVault", address);
  }

  getLockedValue(_ammAddress: Address, _expirationId: BigInt): BigInt {
    let result = super.call(
      "getLockedValue",
      "getLockedValue(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(_ammAddress),
        ethereum.Value.fromUnsignedBigInt(_expirationId)
      ]
    );

    return result[0].toBigInt();
  }

  try_getLockedValue(
    _ammAddress: Address,
    _expirationId: BigInt
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "getLockedValue",
      "getLockedValue(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(_ammAddress),
        ethereum.Value.fromUnsignedBigInt(_expirationId)
      ]
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  getLogicAddress(): Address {
    let result = super.call(
      "getLogicAddress",
      "getLogicAddress():(address)",
      []
    );

    return result[0].toAddress();
  }

  try_getLogicAddress(): ethereum.CallResult<Address> {
    let result = super.tryCall(
      "getLogicAddress",
      "getLogicAddress():(address)",
      []
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toAddress());
  }

  getRedeemableCollateral(_ammAddress: Address, _expirationId: BigInt): BigInt {
    let result = super.call(
      "getRedeemableCollateral",
      "getRedeemableCollateral(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(_ammAddress),
        ethereum.Value.fromUnsignedBigInt(_expirationId)
      ]
    );

    return result[0].toBigInt();
  }

  try_getRedeemableCollateral(
    _ammAddress: Address,
    _expirationId: BigInt
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "getRedeemableCollateral",
      "getRedeemableCollateral(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(_ammAddress),
        ethereum.Value.fromUnsignedBigInt(_expirationId)
      ]
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  getWTokenBalance(poolAddress: Address, seriesId: BigInt): BigInt {
    let result = super.call(
      "getWTokenBalance",
      "getWTokenBalance(address,uint64):(uint256)",
      [
        ethereum.Value.fromAddress(poolAddress),
        ethereum.Value.fromUnsignedBigInt(seriesId)
      ]
    );

    return result[0].toBigInt();
  }

  try_getWTokenBalance(
    poolAddress: Address,
    seriesId: BigInt
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "getWTokenBalance",
      "getWTokenBalance(address,uint64):(uint256)",
      [
        ethereum.Value.fromAddress(poolAddress),
        ethereum.Value.fromUnsignedBigInt(seriesId)
      ]
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  lockedCollateral(param0: Address, param1: BigInt): BigInt {
    let result = super.call(
      "lockedCollateral",
      "lockedCollateral(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(param0),
        ethereum.Value.fromUnsignedBigInt(param1)
      ]
    );

    return result[0].toBigInt();
  }

  try_lockedCollateral(
    param0: Address,
    param1: BigInt
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "lockedCollateral",
      "lockedCollateral(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(param0),
        ethereum.Value.fromUnsignedBigInt(param1)
      ]
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  lockedWTokens(param0: Address, param1: BigInt): BigInt {
    let result = super.call(
      "lockedWTokens",
      "lockedWTokens(address,uint64):(uint256)",
      [
        ethereum.Value.fromAddress(param0),
        ethereum.Value.fromUnsignedBigInt(param1)
      ]
    );

    return result[0].toBigInt();
  }

  try_lockedWTokens(
    param0: Address,
    param1: BigInt
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "lockedWTokens",
      "lockedWTokens(address,uint64):(uint256)",
      [
        ethereum.Value.fromAddress(param0),
        ethereum.Value.fromUnsignedBigInt(param1)
      ]
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  lpShares(param0: Address, param1: BigInt, param2: Address): BigInt {
    let result = super.call(
      "lpShares",
      "lpShares(address,uint256,address):(uint256)",
      [
        ethereum.Value.fromAddress(param0),
        ethereum.Value.fromUnsignedBigInt(param1),
        ethereum.Value.fromAddress(param2)
      ]
    );

    return result[0].toBigInt();
  }

  try_lpShares(
    param0: Address,
    param1: BigInt,
    param2: Address
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "lpShares",
      "lpShares(address,uint256,address):(uint256)",
      [
        ethereum.Value.fromAddress(param0),
        ethereum.Value.fromUnsignedBigInt(param1),
        ethereum.Value.fromAddress(param2)
      ]
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  lpSharesSupply(param0: Address, param1: BigInt): BigInt {
    let result = super.call(
      "lpSharesSupply",
      "lpSharesSupply(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(param0),
        ethereum.Value.fromUnsignedBigInt(param1)
      ]
    );

    return result[0].toBigInt();
  }

  try_lpSharesSupply(
    param0: Address,
    param1: BigInt
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "lpSharesSupply",
      "lpSharesSupply(address,uint256):(uint256)",
      [
        ethereum.Value.fromAddress(param0),
        ethereum.Value.fromUnsignedBigInt(param1)
      ]
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  owner(): Address {
    let result = super.call("owner", "owner():(address)", []);

    return result[0].toAddress();
  }

  try_owner(): ethereum.CallResult<Address> {
    let result = super.tryCall("owner", "owner():(address)", []);
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toAddress());
  }

  proxiableUUID(): Bytes {
    let result = super.call("proxiableUUID", "proxiableUUID():(bytes32)", []);

    return result[0].toBytes();
  }

  try_proxiableUUID(): ethereum.CallResult<Bytes> {
    let result = super.tryCall(
      "proxiableUUID",
      "proxiableUUID():(bytes32)",
      []
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBytes());
  }

  redeemCollateral(expirationDate: BigInt, redeemer: Address): BigInt {
    let result = super.call(
      "redeemCollateral",
      "redeemCollateral(uint256,address):(uint256)",
      [
        ethereum.Value.fromUnsignedBigInt(expirationDate),
        ethereum.Value.fromAddress(redeemer)
      ]
    );

    return result[0].toBigInt();
  }

  try_redeemCollateral(
    expirationDate: BigInt,
    redeemer: Address
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "redeemCollateral",
      "redeemCollateral(uint256,address):(uint256)",
      [
        ethereum.Value.fromUnsignedBigInt(expirationDate),
        ethereum.Value.fromAddress(redeemer)
      ]
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  redeemedCollateral(param0: Address, param1: BigInt, param2: Address): BigInt {
    let result = super.call(
      "redeemedCollateral",
      "redeemedCollateral(address,uint256,address):(uint256)",
      [
        ethereum.Value.fromAddress(param0),
        ethereum.Value.fromUnsignedBigInt(param1),
        ethereum.Value.fromAddress(param2)
      ]
    );

    return result[0].toBigInt();
  }

  try_redeemedCollateral(
    param0: Address,
    param1: BigInt,
    param2: Address
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "redeemedCollateral",
      "redeemedCollateral(address,uint256,address):(uint256)",
      [
        ethereum.Value.fromAddress(param0),
        ethereum.Value.fromUnsignedBigInt(param1),
        ethereum.Value.fromAddress(param2)
      ]
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }
}

export class GetRedeemableCollateralCall extends ethereum.Call {
  get inputs(): GetRedeemableCollateralCall__Inputs {
    return new GetRedeemableCollateralCall__Inputs(this);
  }

  get outputs(): GetRedeemableCollateralCall__Outputs {
    return new GetRedeemableCollateralCall__Outputs(this);
  }
}

export class GetRedeemableCollateralCall__Inputs {
  _call: GetRedeemableCollateralCall;

  constructor(call: GetRedeemableCollateralCall) {
    this._call = call;
  }

  get _ammAddress(): Address {
    return this._call.inputValues[0].value.toAddress();
  }

  get _expirationId(): BigInt {
    return this._call.inputValues[1].value.toBigInt();
  }
}

export class GetRedeemableCollateralCall__Outputs {
  _call: GetRedeemableCollateralCall;

  constructor(call: GetRedeemableCollateralCall) {
    this._call = call;
  }

  get value0(): BigInt {
    return this._call.outputValues[0].value.toBigInt();
  }
}

export class InitializeCall extends ethereum.Call {
  get inputs(): InitializeCall__Inputs {
    return new InitializeCall__Inputs(this);
  }

  get outputs(): InitializeCall__Outputs {
    return new InitializeCall__Outputs(this);
  }
}

export class InitializeCall__Inputs {
  _call: InitializeCall;

  constructor(call: InitializeCall) {
    this._call = call;
  }

  get _addressesProvider(): Address {
    return this._call.inputValues[0].value.toAddress();
  }
}

export class InitializeCall__Outputs {
  _call: InitializeCall;

  constructor(call: InitializeCall) {
    this._call = call;
  }
}

export class LockActiveWTokensCall extends ethereum.Call {
  get inputs(): LockActiveWTokensCall__Inputs {
    return new LockActiveWTokensCall__Inputs(this);
  }

  get outputs(): LockActiveWTokensCall__Outputs {
    return new LockActiveWTokensCall__Outputs(this);
  }
}

export class LockActiveWTokensCall__Inputs {
  _call: LockActiveWTokensCall;

  constructor(call: LockActiveWTokensCall) {
    this._call = call;
  }

  get lpTokenAmount(): BigInt {
    return this._call.inputValues[0].value.toBigInt();
  }

  get lpTokenSupply(): BigInt {
    return this._call.inputValues[1].value.toBigInt();
  }

  get redeemer(): Address {
    return this._call.inputValues[2].value.toAddress();
  }

  get volatility(): BigInt {
    return this._call.inputValues[3].value.toBigInt();
  }
}

export class LockActiveWTokensCall__Outputs {
  _call: LockActiveWTokensCall;

  constructor(call: LockActiveWTokensCall) {
    this._call = call;
  }
}

export class LockCollateralCall extends ethereum.Call {
  get inputs(): LockCollateralCall__Inputs {
    return new LockCollateralCall__Inputs(this);
  }

  get outputs(): LockCollateralCall__Outputs {
    return new LockCollateralCall__Outputs(this);
  }
}

export class LockCollateralCall__Inputs {
  _call: LockCollateralCall;

  constructor(call: LockCollateralCall) {
    this._call = call;
  }

  get seriesId(): BigInt {
    return this._call.inputValues[0].value.toBigInt();
  }

  get collateralAmount(): BigInt {
    return this._call.inputValues[1].value.toBigInt();
  }

  get wTokenAmount(): BigInt {
    return this._call.inputValues[2].value.toBigInt();
  }
}

export class LockCollateralCall__Outputs {
  _call: LockCollateralCall;

  constructor(call: LockCollateralCall) {
    this._call = call;
  }
}

export class RedeemCollateralCall extends ethereum.Call {
  get inputs(): RedeemCollateralCall__Inputs {
    return new RedeemCollateralCall__Inputs(this);
  }

  get outputs(): RedeemCollateralCall__Outputs {
    return new RedeemCollateralCall__Outputs(this);
  }
}

export class RedeemCollateralCall__Inputs {
  _call: RedeemCollateralCall;

  constructor(call: RedeemCollateralCall) {
    this._call = call;
  }

  get expirationDate(): BigInt {
    return this._call.inputValues[0].value.toBigInt();
  }

  get redeemer(): Address {
    return this._call.inputValues[1].value.toAddress();
  }
}

export class RedeemCollateralCall__Outputs {
  _call: RedeemCollateralCall;

  constructor(call: RedeemCollateralCall) {
    this._call = call;
  }

  get value0(): BigInt {
    return this._call.outputValues[0].value.toBigInt();
  }
}

export class RenounceOwnershipCall extends ethereum.Call {
  get inputs(): RenounceOwnershipCall__Inputs {
    return new RenounceOwnershipCall__Inputs(this);
  }

  get outputs(): RenounceOwnershipCall__Outputs {
    return new RenounceOwnershipCall__Outputs(this);
  }
}

export class RenounceOwnershipCall__Inputs {
  _call: RenounceOwnershipCall;

  constructor(call: RenounceOwnershipCall) {
    this._call = call;
  }
}

export class RenounceOwnershipCall__Outputs {
  _call: RenounceOwnershipCall;

  constructor(call: RenounceOwnershipCall) {
    this._call = call;
  }
}

export class TransferOwnershipCall extends ethereum.Call {
  get inputs(): TransferOwnershipCall__Inputs {
    return new TransferOwnershipCall__Inputs(this);
  }

  get outputs(): TransferOwnershipCall__Outputs {
    return new TransferOwnershipCall__Outputs(this);
  }
}

export class TransferOwnershipCall__Inputs {
  _call: TransferOwnershipCall;

  constructor(call: TransferOwnershipCall) {
    this._call = call;
  }

  get newOwner(): Address {
    return this._call.inputValues[0].value.toAddress();
  }
}

export class TransferOwnershipCall__Outputs {
  _call: TransferOwnershipCall;

  constructor(call: TransferOwnershipCall) {
    this._call = call;
  }
}

export class UpdateImplementationCall extends ethereum.Call {
  get inputs(): UpdateImplementationCall__Inputs {
    return new UpdateImplementationCall__Inputs(this);
  }

  get outputs(): UpdateImplementationCall__Outputs {
    return new UpdateImplementationCall__Outputs(this);
  }
}

export class UpdateImplementationCall__Inputs {
  _call: UpdateImplementationCall;

  constructor(call: UpdateImplementationCall) {
    this._call = call;
  }

  get _newImplementation(): Address {
    return this._call.inputValues[0].value.toAddress();
  }
}

export class UpdateImplementationCall__Outputs {
  _call: UpdateImplementationCall;

  constructor(call: UpdateImplementationCall) {
    this._call = call;
  }
}
