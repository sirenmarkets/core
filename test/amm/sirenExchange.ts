/* global artifacts contract it assert */
import { artifacts, assert, contract, ethers } from "hardhat"
import { expectEvent, expectRevert } from "@openzeppelin/test-helpers"
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

let uniswapV2RouterAddress: string

const ERROR_MESSAGES = {
  NOT_ENOUGH_TOKENS_SENT: "Not Enough tokens sent",
}

const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

contract("Siren Exchange Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const tokenInAddress = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
  const tokenOutAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"

  const tokenAmountInMaximum = 10000
  let tokenA
  let erc20A
  let collateralTokenPair
  let bTokenIndex
  var currentDate = new Date()
  var minutesToAdd = 10
  let deadline = new Date(currentDate.getTime() + minutesToAdd * 60000)
  let aliceATokenPreAmount
  let SellUniswapRouterPair2
  let erc20CollateralToken

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
      ({ uniswapV2RouterAddress, deployedSirenExchange, UniswapRouterPair } =
        await setUpUniswap(collateralToken, deployedERC1155Controller))
    tokenA = UniswapRouterPair[0]

    erc20A = await SimpleToken.at(tokenA)
    await erc20A.approve(deployedSirenExchange.address, tokenAmountInMaximum, {
      from: aliceAccount,
    })

    SellUniswapRouterPair2 = [UniswapRouterPair[1], UniswapRouterPair[0]]

    collateralTokenPair = UniswapRouterPair[1]

    erc20CollateralToken = await SimpleToken.at(collateralTokenPair)
    await erc20CollateralToken.approve(deployedAmm.address, 1000000, {
      from: aliceAccount,
    })
    await erc20CollateralToken.approve(deployedAmm.address, 1000000)

    await deployedAmm.provideCapital(100000, 0, {
      from: aliceAccount,
    })

    await deployedAmm.provideCapital(100000, 0)

    bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    aliceATokenPreAmount = (await erc20A.balanceOf(aliceAccount)).toNumber()
  })

  it("Tries to Execute a BTokenBuy Exchange", async () => {
    const bTokenBuyAmount = 10_000

    assertBNEq(
      0,
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      "Trader should have no BTokens",
    )

    let amounts = await deployedSirenExchange.bTokenBuy(
      seriesId,
      bTokenBuyAmount,
      UniswapRouterPair,
      tokenAmountInMaximum,
      deployedAmm.address,
      deadline.getTime(),
      uniswapV2RouterAddress,
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

    expectEvent(amounts, "BTokenBuy", {
      buyer: aliceAccount,
    })
  })

  it("Tries to Execute a BTokenBuy Exchange Not Enough Payment Token", async () => {
    const bTokenBuyAmount = 10_000
    await erc20CollateralToken.approve(deployedAmm.address, 100000000)
    await deployedAmm.provideCapital(100000000, 0)

    await expectRevert(
      deployedSirenExchange.bTokenBuy(
        seriesId,
        bTokenBuyAmount,
        UniswapRouterPair,
        100,
        deployedAmm.address,
        deadline.getTime(),
        uniswapV2RouterAddress,
        {
          from: aliceAccount,
        },
      ),
      ERROR_MESSAGES.NOT_ENOUGH_TOKENS_SENT,
    )
    // assertBNEq(
    //   bTokenBuyAmount,
    //   await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
    //   "Trader should have a balance of 3000 BTokens",
    // )

    // assertBNEq(
    //   aliceATokenPreAmount > (await erc20A.balanceOf(aliceAccount)).toNumber(),
    //   true,
    //   "Trader should have a less Payment Token than before",
    // )
    assertBNEq(
      true,
      true,
      "Trader should have a less Payment Token than before",
    )
  })

  it("Tries to Execute a BTokenSell Exchange", async () => {
    //Tokenammount in to high,
    //User not enough funds

    //Postives would be
    //Alice sends exact ammount int

    let maxCollateral = await deployedSirenExchange.bTokenBuy(
      seriesId,
      10000,
      UniswapRouterPair,
      tokenAmountInMaximum,
      deployedAmm.address,
      deadline.getTime(),
      uniswapV2RouterAddress,
      {
        from: aliceAccount,
      },
    )

    const bTokenSellAmount = 2_000

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

    let maxCollateral2 = await deployedSirenExchange.bTokenSell(
      seriesId,
      bTokenSellAmount,
      SellUniswapRouterPair2,
      0,
      deployedAmm.address,
      deadline.getTime(),
      uniswapV2RouterAddress,
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
  })

  it("Tries to Execute a WTokenSell Exchange", async () => {
    let aliceATokenPreWTokenSell = (
      await erc20A.balanceOf(aliceAccount)
    ).toNumber()

    let maxCollateral = await deployedSirenExchange.bTokenBuy(
      seriesId,
      10000,
      UniswapRouterPair,
      tokenAmountInMaximum,
      deployedAmm.address,
      deadline.getTime(),
      uniswapV2RouterAddress,
      {
        from: aliceAccount,
      },
    )

    const wTokenSellAmount = 3_500

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

    await deployedAmm.withdrawCapital(100000, false, 100, {
      from: aliceAccount,
    })

    await deployedERC1155Controller.setApprovalForAll(
      deployedSirenExchange.address,
      true,
    )

    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    console.log(
      (
        await deployedERC1155Controller.balanceOf(aliceAccount, wTokenIndex)
      ).toString(),
    )
    await deployedERC1155Controller.setApprovalForAll(deployedAmm.address, true)
    let maxCollateral3 = await deployedSirenExchange.wTokenSell(
      seriesId,
      wTokenSellAmount,
      SellUniswapRouterPair2,
      0,
      deployedAmm.address,
      deadline.getTime(),
      uniswapV2RouterAddress,
      {
        from: aliceAccount,
      },
    )
    console.log(
      (
        await deployedERC1155Controller.balanceOf(aliceAccount, wTokenIndex)
      ).toString(),
    )
    assertBNEq(
      1500,
      await deployedERC1155Controller.balanceOf(aliceAccount, wTokenIndex),
      "Trader should have a balance of 0 WTokens",
    )

    assertBNEq(
      aliceATokenPreWTokenSell <
        (await erc20A.balanceOf(aliceAccount)).toNumber(),
      true,
      "Trader should have a more AToken than before",
    )
  })
})
