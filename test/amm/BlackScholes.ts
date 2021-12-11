import { BigNumber, Signer } from "ethers"
import { ethers } from "hardhat"
import {
  BlackScholesContract,
  BlackScholesInstance,
  SeriesControllerInstance,
} from "../../typechain"
import {
  assertCloseTo,
  assertCloseToPercentage,
  callPrice,
  d1,
  d2,
  optionPrices,
  putPrice,
  stdNormalCDF,
  toBN,
} from "../testHelpers/blackScholes"

const TOLERANCE_LEVEL = 0.08 * 1e18

const YEAR_SEC = 31536000
const DAY_SEC = 86400
type BigNumberFive = [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber]
const OTM_BTC_ORACLE_PRICE = 14_000 * 10 ** 8
const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const UNDERLYING_PRICE = OTM_BTC_ORACLE_PRICE
const ANNUALIZED_VOLATILITY = 1 * 1e8 // 100%
import {
  assertBNEq,
  assertBNEqWithTolerance,
  checkBalances,
  setupAllTestContracts,
  setupSeries,
  ONE_WEEK_DURATION,
  blackScholes,
} from "../util"

describe("BlackScholes - values", () => {
  let account: Signer
  let deployedSeriesController: SeriesControllerInstance
  let deployedBlackScholes: BlackScholesInstance
  const BlackScholes: BlackScholesContract = artifacts.require("BlackScholes")
  beforeEach(async () => {
    const signers = await ethers.getSigners()
    account = signers[0]
    deployedBlackScholes = await BlackScholes.new()
  })

  describe("optionPrices - spot == strike", async () => {
    const timeToExp = [
      // 0,
      1, 2, 100, 100000, 250000, 500000, 1000000, 9848575333047,
    ]
    it("calculates optionPrices with respect to changes in time to expiry", async () => {
      for (const val of timeToExp) {
        const volatility = toBN("1")
        const spot = toBN("2000")
        const strike = toBN("2000")
        const rate = toBN("0.1")

        const result = await deployedBlackScholes.optionPrices(
          val,
          volatility.toString(),
          spot.toString(),
          strike.toString(),
          rate.toString(),
        )

        const tAnnualised = val / YEAR_SEC
        const expectedCall = callPrice(
          tAnnualised,
          Number(1),
          Number(2000),
          Number(2000),
          Number(0.1),
        )
        const expectedPut = putPrice(tAnnualised, 1, 2000, 2000, 0.1)

        assertBNEqWithTolerance(
          toBN(expectedCall.toString()),
          result[0].toString(),
          TOLERANCE_LEVEL,
        )
        assertBNEqWithTolerance(
          toBN(expectedPut.toString()),
          result[1].toString(),
          TOLERANCE_LEVEL,
        )
      }
    })
    it("calculates somewhat correctly for 0", async () => {
      const volatility = toBN("1")
      const spot = toBN("2000")
      const strike = toBN("2000")
      const rate = toBN("0.1")
      const result = await deployedBlackScholes.optionPrices(
        0,
        volatility.toString(),
        spot.toString(),
        strike.toString(),
        rate.toString(),
      )

      expect(result[0].toString()).to.eq(
        toBN("0.142811097320000000").toString(),
      )
      expect(result[1].toString()).to.eq(
        toBN("0.142811097320000000").toString(),
      )
    })
  })

  describe("Prices", async () => {
    const defaultTime = 30 * DAY_SEC,
      defaultVolatility = toBN("1"),
      defaultSpot = toBN("1000"),
      defaultStrike = toBN("1100"),
      defaultRate = toBN("0.03")

    it("Basic values give the proper result", async () => {
      const prices = await deployedBlackScholes.optionPrices(
        defaultTime,
        defaultVolatility.toString(),
        defaultSpot.toString(),
        defaultStrike.toString(),
        defaultRate.toString(),
      )
      const call = prices[0]
      const put = prices[1]

      const expectedPrices = optionPrices(
        annualise(defaultTime),
        1,
        1000,
        1100,
        0.03,
      )
      assertBNEqWithTolerance(
        call,
        toBN(expectedPrices[0].toString()),
        TOLERANCE_LEVEL,
      )
      assertBNEqWithTolerance(
        put,
        toBN(expectedPrices[1].toString()),
        TOLERANCE_LEVEL,
      )
    })

    it("Basic values give the proper result", async () => {
      const prices = await deployedBlackScholes.optionPrices(
        2 * DAY_SEC,
        toBN("2").toString(),
        toBN("10000").toString(),
        toBN("9052").toString(),
        toBN("-15").toString(),
      )
      const call = prices[0]
      const put = prices[1]

      assertBNEqWithTolerance(call, toBN("675.3066775"), 0.5 * 1e18)
      assertBNEqWithTolerance(put, toBN("502.7372001"), 0.5 * 1e18)
    })
    it("Inverting spot and strike with no risk free rate swaps the prices", async () => {
      const pricesA = await deployedBlackScholes.optionPrices(
        defaultTime,
        defaultVolatility.toString(),
        defaultSpot.toString(),
        defaultStrike.toString(),
        0,
      )

      const pricesB = await deployedBlackScholes.optionPrices(
        defaultTime,
        defaultVolatility.toString(),
        defaultStrike.toString(),
        defaultSpot.toString(),
        0,
      )

      assertCloseToPercentage(
        toBN(pricesA[0].toString()),
        toBN(pricesB[1].toString()),
      )
      assertCloseToPercentage(
        toBN(pricesA[0].toString()),
        toBN(pricesB[1].toString()),
      )
    })
  })
})

// /*
//  * Test-specific utility functions
//  */

function annualise(seconds: number): number {
  return seconds / YEAR_SEC
}

// // Converts black scholes inputs from floats
// // to a BigNumber form appropriate to feed into the smart contracts,
// // optionally annualising the time input, which is otherwise an
// // integer quantity of seconds.
// function bsInputs(
//   tSeconds: number,
//   vol: number,
//   spot: number,
//   strike: number,
//   rate: number,
//   precise: boolean = false,
// ): BigNumberFive {
//   const c = precise ? (x: number) => toBN(x.toString()).mul(1e9) : (x: number) => toBN(x.toString());
//   return [precise ? c(annualise(tSeconds)) : BigNumber.from(tSeconds), c(vol), c(spot), c(strike), c(rate)];
// }
