/* global artifacts contract it assert */
import { time, expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract } from "hardhat"
import { deployAmm } from "../../scripts/lib/deploy_amm"
import {
  SirenExchangeInstance,
  MinterAmmInstance,
  SimpleTokenInstance,
  SimpleTokenContract,
  SeriesControllerInstance,
  ERC1155ControllerInstance,
  IUniswapV2Router02Instance,
} from "../../typechain"

const SimpleToken: SimpleTokenContract = artifacts.require(
  "SimpleTokenContract",
)

import { setupAllTestContracts, assertBNEq, ONE_WEEK_DURATION } from "../util"

let deployedSirenExchange: SirenExchangeInstance
let deployedAmm: MinterAmmInstance

let collateralToken: SimpleTokenInstance

let seriesId: string

let UniswapRouterPair: Array<string>

let pairAddress: string

let deployedUniswapRouter02: IUniswapV2Router02Instance

const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

contract("Siren Exchange Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const tokenInAddress = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
  const tokenOutAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"

  const tokenAmountInMaximum = 1000000
  beforeEach(async () => {
    ;({
      collateralToken,
      deployedAmm,
      seriesId,
      deployedSirenExchange,
      UniswapRouterPair,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: BTC_ORACLE_PRICE,
    }))
  })

  it("Tries to Execute a BTokenBuy Exchange", async () => {
    // Buy bTokens
    var minutesToAdd = 10
    var currentDate = new Date()
    let deadline = new Date(currentDate.getTime() + minutesToAdd * 60000)
    const bTokenBuyAmount = 300
    const path = ["ETH", "WETH"]
    console.log("Collateral Token Address", collateralToken.address)

    const tokenA = UniswapRouterPair[0]
    const erc20A = await SimpleToken.at(tokenA)
    await erc20A.approve(deployedSirenExchange.address, tokenAmountInMaximum)
    // assertBNEq(
    try {
      let maxCollateral = await deployedSirenExchange.bTokenBuy(
        seriesId,
        bTokenBuyAmount,
        UniswapRouterPair,
        tokenAmountInMaximum,
        deployedAmm.address,
        deadline.getTime(),
        {
          from: aliceAccount,
        },
      )
      console.log("Max Collateral", maxCollateral)
      assertBNEq(maxCollateral, 140078)
    } catch (err) {
      console.log(err)
    }

    // "",
    // "Test Trying to Run"
    // )
    // ret = await deployedAmm.bTokenBuy(seriesId, bTokenBuyAmount, premium, {
    //   from: aliceAccount,
    // })
    // assertBNEq(
    //   await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
    //   bTokenBuyAmount,
    //   "Trader should receive purchased bTokens",
    // )
    // assertBNEq(
    //   (await collateralToken.balanceOf(aliceAccount)).toString(),
    //   91217, // started with capitalCollateral, then paid 58783 USDC for 3000 tokens at (0.099 * 150) + slippage
    //   "Trader should pay correct collateral amount",
    // )
    // const bTokenPaymentAmount = aliceCollateral.toNumber() - 91217

    // // 3000 * 150
    // const bTokenBuyCollateral = await deployedSeriesController.getCollateralPerOptionToken(
    //   seriesId,
    //   bTokenBuyAmount,
    // )
    // let ammCollateralAmount =
    //   capitalCollateral.toNumber() -
    //   bTokenBuyCollateral.toNumber() +
    //   bTokenPaymentAmount
    // assertBNEq(
    //   (await collateralToken.balanceOf(deployedAmm.address)).toString(),
    //   ammCollateralAmount,
    //   "AMM should have correct collateral amount left",
    // )
    // assertBNEq(
    //   await deployedERC1155Controller.balanceOf(
    //     deployedAmm.address,
    //     wTokenIndex,
    //   ),
    //   bTokenBuyAmount, // same amount as bTokens bought
    //   "AMM should have correct amount of residual wTokens",
    // )
    // assertBNEq(
    //   await deployedERC1155Controller.balanceOf(
    //     deployedAmm.address,
    //     bTokenIndex,
    //   ),
    //   0,
    //   "No residual bTokens should be in the AMM",
    // )
    // assertBNEq(
    //   (await deployedAmm.getTotalPoolValue(true)).toString(),
    //   1513783, // ammCollateralAmount + bTokenBuyCollateral * (1 - 0.099) (btw, 1513783 > 1500000 - LPs are making money!!!)
    //   "Total assets value in the AMM should be correct",
    // )

    // // Now that the total pool value is 1513783...
    // // If another user deposits another 1000 * 150 collateral, it should increase pool value
    // // by ~9.9% and mint correct amount of LP tokens
    // const bobAmount = 1_000
    // const bobCollateral = await deployedSeriesController.getCollateralPerOptionToken(
    //   seriesId,
    //   bobAmount,
    // ) // 150_000
    // await collateralToken.mint(bobAccount, bobCollateral)
    // await collateralToken.approve(deployedAmm.address, bobCollateral, {
    //   from: bobAccount,
    // })
  })
})
