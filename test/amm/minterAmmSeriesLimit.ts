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

  it("Expect revert when adding more than 100 series", async () => {
    for (let i = 0; i < 101; i++) {
      // Deploy additional series
      if (i < 100) {
        await setupSeries({
          deployedSeriesController,
          underlyingToken,
          priceToken,
          collateralToken,
          expiration: expiration + i * oneWeek,
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
          expiration: expiration + i * oneWeek,
          restrictedMinters: [deployedAmm.address],
          strikePrice: STRIKE_PRICE.toString(),
          isPutOption: false,
        })
        await expectRevert(seriesPromise, "Too many open series")
      }
    }
  })

  it("Add 100 series successfully", async () => {
    for (let i = 0; i < 100; i++) {
      await setupSeries({
        deployedSeriesController,
        underlyingToken,
        priceToken,
        collateralToken,
        expiration: expiration + i * oneWeek,
        restrictedMinters: [deployedAmm.address],
        strikePrice: STRIKE_PRICE.toString(),
        isPutOption: false,
      })
    }
  })
})
