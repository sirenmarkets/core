import { BigInt, Address, log} from "@graphprotocol/graph-ts"
import {
    SeriesEntity,
    ERC20Token,
  } from "../../../generated/schema"
export let ZERO = BigInt.fromI32(0)
export let ONE = BigInt.fromI32(1)
export let TWO = BigInt.fromI32(2)


export function getDecimalScale(seriesControllerAddress: Address, seriesId: BigInt): BigInt {
    // The series Entity have to already exists
    let seriesEntity = SeriesEntity.load(
        seriesControllerAddress.toHexString() + "-" + seriesId.toString(),
      )
    let underlying = ERC20Token.load(seriesEntity.underlyingToken)
    let collateral = ERC20Token.load(seriesEntity.collateralToken)
    let udec = underlying.decimals
    let cdec= collateral.decimals
    let decimals = udec - cdec as u8
    return BigInt.fromI32(10).pow(decimals)
}
