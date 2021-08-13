/* global artifacts contract it assert */
import { time, BN } from "@openzeppelin/test-helpers"
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

/**
 * Testing the flows for the Series Contract
 */
contract("Minter AMM Gas Measurement", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]

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

  it("Measures gas for single-series: 0 open and 1 expired", async () => {
    await measureGas(0, 1)
  })

  it("Measures gas for 2 series: 0 open and 2 expired", async () => {
    await measureGas(0, 2)
  })

  it("Measures gas for 4 series: 1 open and 3 expired", async () => {
    await measureGas(1, 3)
  })

  it("Measures gas for 8 series: 8 open and 0 expired", async () => {
    await measureGas(8, 0)
  })

  ////////////////////////// use xit here so we don't slow test runs down /////////////////////
  //////////////// we keep these tests here to easily see gas usage later on //////////////////
  xit("Measures gas for 12 series: 8 open and 4 expired", async () => {
    await measureGas(8, 4)
  })

  xit("Measures gas for 16 series: 12 open and 4 expired", async () => {
    await measureGas(12, 4)
  })

  xit("Measures gas for 20 series: 8 open and 12 expired", async () => {
    await measureGas(8, 12)
  })

  const measureGas = async (
    numOpenSeries: number,
    numExpiredSeries: number,
  ) => {
    const numSeries = numOpenSeries + numExpiredSeries
    console.log("**************************************************")
    console.log(
      `Measuring gas for AMM with ${numSeries}: ${numOpenSeries} open series and ${numExpiredSeries} expired series:`,
    )
    console.log("**************************************************")

    const series = []
    for (let i = 0; i < numSeries; i++) {
      // Deploy additional series
      const { seriesId } = await setupSeries({
        deployedSeriesController,
        underlyingToken,
        priceToken,
        collateralToken,
        expiration: expiration + i * oneWeek,
        restrictedMinters: [deployedAmm.address],
        strikePrice: STRIKE_PRICE.toString(),
        isPutOption: false,
      })
      series.push(seriesId)
    }

    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    const initialCapital = 100000
    // Approve collateral
    await underlyingToken.mint(ownerAccount, initialCapital)
    await underlyingToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    let ret: any = await deployedAmm.provideCapital(initialCapital, 0)
    printGasLog("Initial LP deposit", ret.receipt.gasUsed)
    assert.isBelow(
      ret.receipt.gasUsed,
      150_000,
      "Initial LP deposit gas should be below threshold",
    )

    // Now let's do some trading from another account
    await underlyingToken.mint(aliceAccount, 5000 * numSeries)
    await underlyingToken.approve(deployedAmm.address, 5000 * numSeries, {
      from: aliceAccount,
    })

    for (let i = 0; i < numSeries; i++) {
      const seriesId = series[i]
      const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

      // Buy bTokens
      ret = await deployedAmm.bTokenBuy(seriesId, 3000, 3000, {
        from: aliceAccount,
      })
      printGasLog("bTokenBuy 1", ret.receipt.gasUsed)
      assert.isBelow(
        ret.receipt.gasUsed,
        390_000, // TODO: this is too high, we should aim for <= 200K
        "bTokenBuy gas should be below threshold",
      )

      // Buy more bTokens
      ret = await deployedAmm.bTokenBuy(seriesId, 3000, 3000, {
        from: aliceAccount,
      })
      printGasLog("bTokenBuy 2", ret.receipt.gasUsed)
      assert.isBelow(
        ret.receipt.gasUsed,
        290_000, // TODO: this is too high, we should aim for <= 200K
        "bTokenBuy gas should be below threshold",
      )

      // Sell bTokens
      await deployedERC1155Controller.setApprovalForAll(
        deployedAmm.address,
        true,
        {
          from: aliceAccount,
        },
      )
      ret = await deployedAmm.bTokenSell(seriesId, 1000, 0, {
        from: aliceAccount,
      })
      printGasLog("bTokenSell 1", ret.receipt.gasUsed)
      assert.isBelow(
        ret.receipt.gasUsed,
        300_000, // TODO: this is too high, we should aim for <= 200K
        "bTokenSell gas should be below threshold",
      )

      // Sell more bTokens
      ret = await deployedAmm.bTokenSell(seriesId, 1000, 0, {
        from: aliceAccount,
      })
      printGasLog("bTokenSell 2", ret.receipt.gasUsed)
      assert.isBelow(
        ret.receipt.gasUsed,
        270_000, // TODO: this is too high, we should aim for <= 200K
        "bTokenSell gas should be below threshold",
      )
    }

    // Withdraw some liquidity
    ret = await deployedAmm.withdrawCapital(initialCapital / 2, true, 10000)
    printGasLog("Post-sale LP withdrawal", ret.receipt.gasUsed)
    assert.isBelow(
      ret.receipt.gasUsed,
      2_000_000, // TODO: try bringing this lower
      "withdrawCapital gas should be below threshold",
    )

    // Provide capital again
    await underlyingToken.approve(
      deployedAmm.address,
      Math.floor(initialCapital / 10),
    )
    ret = await deployedAmm.provideCapital(Math.floor(initialCapital / 10), 0)
    printGasLog("Post-sale LP deposit", ret.receipt.gasUsed)
    assert.isBelow(
      ret.receipt.gasUsed,
      2_000_000,
      "LP deposit gas should be below threshold",
    )

    // Move the block time into the future so exactly numExpiredSeries number
    // of series are expired
    await time.increaseTo(expiration + numExpiredSeries * oneWeek + 60)

    // now that we advanced forward to the expiration date, we can set the Series' matching
    // settlement price on the PriceOracle
    ret = await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    if (numExpiredSeries > 0) {
      // Make sure series is expired
      assertBNEq(
        await deployedSeriesController.state(series[numExpiredSeries - 1]),
        STATE_EXPIRED,
        "Series should expire",
      )
    }

    // Get LP token balance
    const lpTokenBalance = await lpToken.balanceOf.call(ownerAccount)
    // console.log("lpTokenBalance", lpTokenBalance.toString())

    // Partial withdrawal post-expiry
    ret = await deployedAmm.withdrawCapital(1000, true, 1)
    printGasLog("Post-expiry withdrawal 1", ret.receipt.gasUsed)
    assert.isBelow(
      ret.receipt.gasUsed,
      2_000_000, // TODO: too high for 8 series
      "Post-expiry withdrawal 1 gas should be below threshold",
    )

    // Full withdrawal post-expiry
    ret = await deployedAmm.withdrawCapital(
      lpTokenBalance.sub(new BN(1000)),
      true,
      1,
    )
    printGasLog("Post-expiry withdrawal 2", ret.receipt.gasUsed)
    assert.isBelow(
      ret.receipt.gasUsed,
      2_000_000, // TODO: too high for 4-8 series
      "Post-expiry withdrawal 2 gas should be below threshold",
    )

    // Check end-balances for all series
    const ownerCollateralBalance = await underlyingToken.balanceOf.call(
      ownerAccount,
    )
    for (let i = 0; i < numSeries; i++) {
      const seriesId = series[i]
      const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
      const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

      // Check LP balances
      await checkBalances(
        deployedERC1155Controller,
        ownerAccount,
        "Owner",
        underlyingToken,
        bTokenIndex,
        wTokenIndex,
        lpToken,
        ownerCollateralBalance.toString(),
        0,
        (
          await deployedERC1155Controller.balanceOf(ownerAccount, wTokenIndex)
        ).toNumber(),
        0,
      )

      // Check AMM balances
      await checkBalances(
        deployedERC1155Controller,
        deployedAmm.address,
        "AMM",
        underlyingToken,
        bTokenIndex,
        wTokenIndex,
        lpToken,
        0,
        0,
        0,
        0,
      )
    }
  }
})
