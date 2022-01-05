/* global artifacts contract it assert */
import { time, expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract, assert } from "hardhat"
import {
  PriceOracleInstance,
  SimpleTokenContract,
  SimpleTokenInstance,
  MinterAmmInstance,
  SeriesControllerInstance,
  ERC1155ControllerInstance,
} from "../../typechain"

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

import {
  printGasLog,
  setupAllTestContracts,
  setupSeries,
  checkBalances,
  assertBNEq,
} from "../util"

let deployedSeriesController: SeriesControllerInstance
let deployedERC1155Controller: ERC1155ControllerInstance
let deployedAmm: MinterAmmInstance
let deployedPriceOracle: PriceOracleInstance

let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance
let collateralToken: SimpleTokenInstance

let expiration: number

const STRIKE_PRICE = 20000e8 // 20000 USD
const BTC_ORACLE_PRICE = 14_000e8 // 14000 USD

const STATE_EXPIRED = 1

const oneDay = 60 * 60 * 24
const oneWeek = 7 * oneDay

const SERIES_LIMIT = 60

contract("AMM Series Limit Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  beforeEach(async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedAmm,
      deployedSeriesController,
      deployedERC1155Controller,
      deployedPriceOracle,
      expiration,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: BTC_ORACLE_PRICE,
    }))
  })

  it(`Expect revert when adding more than ${SERIES_LIMIT} series`, async () => {
    for (let i = 0; i < SERIES_LIMIT + 1; i++) {
      // Deploy additional series
      if (i < SERIES_LIMIT) {
        await setupSeries({
          deployedSeriesController,
          underlyingToken,
          priceToken,
          collateralToken,
          expiration: expiration + (i + 1) * oneWeek,
          restrictedMinters: [deployedAmm.address],
          strikePrice: STRIKE_PRICE.toString(),
          isPutOption: false,
        })
      } else {
        const seriesPromise = setupSeries({
          deployedSeriesController,
          underlyingToken,
          priceToken,
          collateralToken,
          expiration: expiration + (i + 1) * oneWeek,
          restrictedMinters: [deployedAmm.address],
          strikePrice: STRIKE_PRICE.toString(),
          isPutOption: false,
        })
        await expectRevert(seriesPromise, "E24") // Too many open series
      }
    }
  })

  it(`Add ${SERIES_LIMIT} series successfully`, async () => {
    for (let i = 0; i < SERIES_LIMIT; i++) {
      await setupSeries({
        deployedSeriesController,
        underlyingToken,
        priceToken,
        collateralToken,
        expiration: expiration + (i + 1) * oneWeek,
        restrictedMinters: [deployedAmm.address],
        strikePrice: STRIKE_PRICE.toString(),
        isPutOption: false,
      })
    }
  })
})
