/* global artifacts contract it assert */
import { artifacts, assert, contract, ethers } from "hardhat"
import { deployAmm } from "../../scripts/lib/deploy_amm"
import {
  SirenExchangeInstance,
  MinterAmmInstance,
  SimpleTokenInstance,
  SimpleTokenContract,
  ERC1155ControllerInstance,
  SeriesControllerInstance,
} from "../../typechain"

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

import { setUpUniswap, setupAllTestContracts, assertBNEq } from "../util"

let deployedSirenExchange: SirenExchangeInstance
let deployedAmm: MinterAmmInstance

let collateralToken: SimpleTokenInstance

let seriesId: string

let deployedERC1155Controller: ERC1155ControllerInstance

let UniswapRouterPair: Array<string>

let deployedSeriesController: SeriesControllerInstance

const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

contract("Siren Exchange Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const tokenInAddress = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
  const tokenOutAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"

  const tokenAmountInMaximum = 10000
  beforeEach(async () => {
    ;({
      collateralToken,
      deployedAmm,
      seriesId,
      deployedERC1155Controller,
      deployedSeriesController,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: BTC_ORACLE_PRICE,
    })),
      ({ deployedSirenExchange, UniswapRouterPair } = await setUpUniswap(
        collateralToken,
        deployedERC1155Controller,
      ))
  })

  it("Tries to Execute a BTokenBuy Exchange", async () => {
    var minutesToAdd = 10
    var currentDate = new Date()
    let deadline = new Date(currentDate.getTime() + minutesToAdd * 60000)
    const bTokenBuyAmount = 10_000

    const tokenA = UniswapRouterPair[0]

    const erc20A = await SimpleToken.at(tokenA)
    await erc20A.approve(deployedSirenExchange.address, tokenAmountInMaximum, {
      from: aliceAccount,
    })

    //Tokenammount in to high,
    //User not enough funds

    //Postives would be
    //Alice sends exact ammount int

    const collateralTokenPair = UniswapRouterPair[1]

    const erc20CollateralToken = await SimpleToken.at(collateralTokenPair)
    await erc20CollateralToken.approve(deployedAmm.address, 1000000)

    await deployedAmm.provideCapital(1000000, 0)

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    const aliceATokenPreAmount = (
      await erc20A.balanceOf(aliceAccount)
    ).toNumber()

    assertBNEq(
      0,
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      "Trader should have no BTokens",
    )

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
    assertBNEq(
      bTokenBuyAmount,
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      "Trader should have a balance of 3000 BTokens",
    )

    assertBNEq(
      aliceATokenPreAmount > (await erc20A.balanceOf(aliceAccount)).toNumber(),
      true,
      "Trader should have a less Payment Token than before",
    )

    //Tokenammount in to high,
    //User not enough funds

    //Postives would be
    //Alice sends exact ammount int
    const bTokenSellAmount = 2_000
    console.log(
      "ALICE BEFORE SELL",
      (await erc20A.balanceOf(aliceAccount)).toNumber(),
    )

    assertBNEq(
      10000,
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      "Trader should have no BTokens",
    )

    await deployedERC1155Controller.setApprovalForAll(
      deployedSirenExchange.address,
      true,
      {
        from: aliceAccount,
      },
    )
    await deployedERC1155Controller.setApprovalForAll(
      deployedAmm.address,
      true,
      {
        from: aliceAccount,
      },
    )
    const UniswapRouterPair2 = [UniswapRouterPair[1], UniswapRouterPair[0]]
    let maxCollateral2 = await deployedSirenExchange.bTokenSell(
      seriesId,
      bTokenSellAmount,
      UniswapRouterPair2,
      0,
      deployedAmm.address,
      deadline.getTime(),
      {
        from: aliceAccount,
      },
    )

    assertBNEq(
      8000,
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      "Trader should have a balance of 0 BTokens",
    )

    assertBNEq(
      aliceATokenPreAmount > (await erc20A.balanceOf(aliceAccount)).toNumber(),
      true,
      "Trader should have a less Payment Token than before",
    )

    const wTokenSellAmount = 3_500

    console.log(
      "ALICE BEFORE SELL",
      (await erc20A.balanceOf(aliceAccount)).toNumber(),
    )
    await deployedERC1155Controller.setApprovalForAll(
      deployedSirenExchange.address,
      true,
    )

    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

    console.log(
      (
        await deployedERC1155Controller.balanceOf(
          deployedAmm.address,
          wTokenIndex,
        )
      ).toString,
    )

    const wTokenAmmBalance = await deployedERC1155Controller.balanceOf(
      deployedAmm.address,
      wTokenIndex,
    )
    await deployedAmm.withdrawCapital(10000, false, 10000)

    await deployedERC1155Controller.setApprovalForAll(deployedAmm.address, true)
    let maxCollateral3 = await deployedSirenExchange.wTokenSell(
      seriesId,
      wTokenSellAmount,
      UniswapRouterPair2,
      3000,
      deployedAmm.address,
      deadline.getTime(),
    )
    console.log(
      "ALICE AFTER SELL",
      (await erc20A.balanceOf(aliceAccount)).toNumber(),
    )
    // assertBNEq(0, await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex), "Trader should have a balance of 0 BTokens");

    assertBNEq(
      aliceATokenPreAmount > (await erc20A.balanceOf(aliceAccount)).toNumber(),
      true,
      "Trader should have a less Payment Token than before",
    )
  })
})
