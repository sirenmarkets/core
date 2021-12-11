import { erf } from "mathjs"
import { BigNumber } from "ethers"
import { ethers } from "hardhat"
export function stdNormalCDF(x: number): number {
  return (1.0 - erf(-x / Math.sqrt(2))) / 2.0
}

export function stdNormal(x: number): number {
  return Math.exp((-x * x) / 2.0) / Math.sqrt(2.0 * Math.PI)
}

export function d1(
  tAnnualised: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
): number {
  return (
    (Math.log(spot / strike) + (rate + (vol * vol) / 2.0) * tAnnualised) /
    (vol * Math.sqrt(tAnnualised))
  )
}

export function d2(
  tAnnualised: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
): number {
  return d1(tAnnualised, vol, spot, strike, rate) - vol * Math.sqrt(tAnnualised)
}

export function PV(value: number, rate: number, tAnnualised: number): number {
  return value * Math.exp(-rate * tAnnualised)
}

export function callPrice(
  tAnnualised: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
): number {
  let callPrice =
    stdNormalCDF(d1(tAnnualised, vol, spot, strike, rate)) * spot -
    stdNormalCDF(d2(tAnnualised, vol, spot, strike, rate)) *
      PV(strike, rate, tAnnualised)
  return callPrice
}

export function putPrice(
  tAnnualised: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
): number {
  return (
    stdNormalCDF(-d2(tAnnualised, vol, spot, strike, rate)) *
      PV(strike, rate, tAnnualised) -
    stdNormalCDF(-d1(tAnnualised, vol, spot, strike, rate)) * spot
  )
}

export function optionPrices(
  tAnnualised: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
): [number, number] {
  return [
    callPrice(tAnnualised, vol, spot, strike, rate),
    putPrice(tAnnualised, vol, spot, strike, rate),
  ]
}

export function callDelta(
  tAnnualised: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
): number {
  return stdNormalCDF(d1(tAnnualised, vol, spot, strike, rate))
}

export function putDelta(
  tAnnualised: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
): number {
  return callDelta(tAnnualised, vol, spot, strike, rate) - 1.0
}

export function vega(
  tAnnualised: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
): number {
  return (
    spot *
    stdNormal(d1(tAnnualised, vol, spot, strike, rate)) *
    Math.sqrt(tAnnualised)
  )
}

export function gamma(
  tAnnualised: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
) {
  return (
    stdNormal(d1(tAnnualised, vol, spot, strike, rate)) /
    (spot * vol * Math.sqrt(tAnnualised))
  )
}

export function theta(
  tAnnualized: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
  isCall: boolean,
) {
  if (isCall) {
    return (
      (-spot * stdNormal(d1(tAnnualized, vol, spot, strike, rate)) * vol) /
        (2 * Math.sqrt(tAnnualized)) -
      rate *
        strike *
        Math.exp(-rate * tAnnualized) *
        stdNormalCDF(d2(tAnnualized, vol, spot, strike, rate))
    )
  } else {
    return (
      (-spot * stdNormal(d1(tAnnualized, vol, spot, strike, rate)) * vol) /
        (2 * Math.sqrt(tAnnualized)) +
      rate *
        strike *
        Math.exp(-rate * tAnnualized) *
        stdNormalCDF(-d2(tAnnualized, vol, spot, strike, rate))
    )
  }
}

export function rho(
  tAnnualised: number,
  vol: number,
  spot: number,
  strike: number,
  rate: number,
  isCall: boolean,
) {
  if (isCall) {
    return (
      strike *
      tAnnualised *
      Math.exp(-rate * tAnnualised) *
      stdNormalCDF(d2(tAnnualised, vol, spot, strike, rate))
    )
  } else {
    return (
      -strike *
      tAnnualised *
      Math.exp(-rate * tAnnualised) *
      stdNormalCDF(-d2(tAnnualised, vol, spot, strike, rate))
    )
  }
}

export function send(method: string, params?: Array<any>) {
  return ethers.provider.send(method, params === undefined ? [] : params)
}

export function mineBlock() {
  return send("evm_mine", [])
}

/**
 *  Increases the time in the EVM.
 *  @param seconds Number of seconds to increase the time by
 */
export async function fastForward(seconds: number) {
  const method = "evm_increaseTime"
  const params = [seconds]

  await send(method, params)

  await mineBlock()
}

/**
 *  Increases the time in the EVM to as close to a specific timestamp as possible
 */
export async function fastForwardTo(time: number) {
  const timestamp = await currentTime()
  if (time < timestamp) {
    throw new Error(
      `Time parameter (${time}) is less than now ${timestamp}. You can only fast forward to times in the future.`,
    )
  }

  const secondsBetween = Math.floor(time - timestamp)
  await fastForward(secondsBetween)
}

/**
 *  Takes a snapshot and returns the ID of the snapshot for restoring later.
 */
export async function takeSnapshot(): Promise<number> {
  const result = await send("evm_snapshot")
  await mineBlock()
  return result
}

/**
 *  Restores a snapshot that was previously taken with takeSnapshot
 *  @param id The ID that was returned when takeSnapshot was called.
 */
export async function restoreSnapshot(id: number) {
  await send("evm_revert", [id])
  await mineBlock()
}

export function assertCloseTo(
  a: BigNumber,
  b: BigNumber,
  delta: BigNumber = toBN("0.5"),
) {
  expect(
    a.sub(b).abs().lte(delta),
    `${fromBN(a)} is not close to ${fromBN(b)} +/- ${fromBN(delta)}`,
  ).is.true
}

export function assertCloseToPercentage(
  a: BigNumber,
  b: BigNumber,
  percentage: BigNumber = toBN("0.0005"),
) {
  if (b.eq(0)) {
    expect(
      a.eq(0),
      `${fromBN(a)} is not close to ${fromBN(b)} +/- ${fromBN(
        percentage.mul(100),
      )}%`,
    ).is.true
    return
  }
  expect(
    b.sub(a).mul(toBN("1")).div(b).abs().lte(percentage),
    `${fromBN(a)} is not close to ${fromBN(b)} +/- ${fromBN(
      percentage.mul(100),
    )}%`,
  ).is.true
}

export function assertNotCloseToPercentage(
  a: BigNumber,
  b: BigNumber,
  percentage: BigNumber = toBN("0.0005"),
) {
  if (b.eq(0)) {
    expect(
      a.eq(0),
      `${fromBN(a)} is close to ${fromBN(b)} +/- ${fromBN(
        percentage.mul(100),
      )}%`,
    ).is.false
    return
  }
  expect(
    b.sub(a).mul(toBN("1")).div(b).abs().lte(percentage),
    `${fromBN(a)} is close to ${fromBN(b)} +/- ${fromBN(percentage.mul(100))}%`,
  ).is.false
}

export async function currentTime() {
  const { timestamp } = await ethers.provider.getBlock("latest")
  return timestamp
}

export function toBN(val: string) {
  // multiplier is to handle decimals
  if (val.includes("e")) {
    if (parseFloat(val) > 1) {
      const x = val.split(".")
      const y = x[1].split("e+")
      const exponent = parseFloat(y[1])
      const newVal = x[0] + y[0] + "0".repeat(exponent - y[0].length)
      // console.warn(`Warning: toBN of val with exponent, converting to string. (${val}) converted to (${newVal})`);
      val = newVal
    } else {
      // console.warn(
      //   `Warning: toBN of val with exponent, converting to float. (${val}) converted to (${parseFloat(val).toFixed(
      //     18,
      //   )})`,
      // );
      val = parseFloat(val).toFixed(18)
    }
  } else if (val.includes(".") && val.split(".")[1].length > 18) {
    // console.warn(`Warning: toBN of val with more than 18 decimals. Stripping excess. (${val})`);
    const x = val.split(".")
    x[1] = x[1].slice(0, 18)
    val = x[0] + "." + x[1]
  }
  return ethers.utils.parseUnits(val, 18)
}

export function fromBN(val: BigNumber): string {
  return ethers.utils.formatUnits(val, 18)
}
