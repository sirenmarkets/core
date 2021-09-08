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

let uniswapRouterPath: Array<string>

let deployedSeriesController: SeriesControllerInstance

let uniswapV2RouterAddress: string

const ERROR_MESSAGES = {
  NOT_ENOUGH_TOKENS_IN_ACCOUNT: "SirenExchange: Not Enough tokens sent",
  NOT_ENOUGH_TOKENS_SENT: "SirenExchange: Not Enough tokens sent",
  MINIMUM_TOKENS_TO_HIGH: "SirenExchange: Minimum token amount out not met",
  NOT_ENOUGH_BTOKENS_SENT: "ERC1155: insufficient balance for transfer",
}

const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

//Testing Siren Exchange contract
contract("Siren Exchange Verification", (accounts) => {
  const aliceAccount = accounts[1]

  const tokenAmountInMaximum = 10000
  let userTokenAddress
  let userToken
  let intermediateTokenAddress
  let intermediateToken
  let collateralTokenPair
  let bTokenIndex
  var currentDate = new Date()
  var minutesToAdd = 10
  let deadline = new Date(currentDate.getTime() + minutesToAdd * 60000)
  let aliceATokenPreAmount
  let sellUniswapRouterPath2
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
      ({ uniswapV2RouterAddress, deployedSirenExchange, uniswapRouterPath } =
        await setUpUniswap(collateralToken, deployedERC1155Controller))

    //Below we provide capital for our AMMs so we can do trading on them
    userTokenAddress = uniswapRouterPath[0]
    intermediateTokenAddress = uniswapRouterPath[1]

    userToken = await SimpleToken.at(userTokenAddress)
    intermediateToken = await SimpleToken.at(intermediateTokenAddress)
    await userToken.approve(
      deployedSirenExchange.address,
      tokenAmountInMaximum,
      {
        from: aliceAccount,
      },
    )

    //We reverse the route we created so we can test selling as well as buying.
    sellUniswapRouterPath2 = [
      uniswapRouterPath[2],
      uniswapRouterPath[1],
      uniswapRouterPath[0],
    ]

    collateralTokenPair = uniswapRouterPath[2]

    erc20CollateralToken = await SimpleToken.at(collateralTokenPair)
    await erc20CollateralToken.approve(deployedAmm.address, 1000000, {
      from: aliceAccount,
    })

    await deployedAmm.provideCapital(100000, 0, {
      from: aliceAccount,
    })

    await erc20CollateralToken.approve(deployedAmm.address, 1000000)

    await deployedAmm.provideCapital(100000, 0)

    bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    aliceATokenPreAmount = (await userToken.balanceOf(aliceAccount)).toNumber()
  })
  describe("Successes", async () => {
    //Successful BtokenBuy
    it("Tries to Execute a BTokenBuy Exchange", async () => {
      const bTokenBuyAmount = 10_000

      assertBNEq(
        0,
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

      let amounts = await deployedSirenExchange.bTokenBuy(
        seriesId,
        bTokenBuyAmount,
        uniswapRouterPath,
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
        (
          await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex)
        ).toNumber(),
        "Trader should have a balance of 10_000 BTokens",
      )

      assertBNEq(
        aliceATokenPreAmount >
          (await userToken.balanceOf(aliceAccount)).toNumber(),
        true,
        "Trader should have a less Payment Token than before",
      )

      expectEvent(amounts, "BTokenBuy", {
        trader: aliceAccount,
      })
    })

    //Successful BtokenSell
    it("Tries to Execute a BTokenSell Exchange", async () => {
      await deployedSirenExchange.bTokenBuy(
        seriesId,
        10000,
        uniswapRouterPath,
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
        "Trader should have 10_000 BTokens",
      )

      await deployedERC1155Controller.setApprovalForAll(
        deployedSirenExchange.address,
        true,
        {
          from: aliceAccount,
        },
      )

      const aliceATokenPreSell = (
        await userToken.balanceOf(aliceAccount)
      ).toNumber()
      await deployedSirenExchange.bTokenSell(
        seriesId,
        bTokenSellAmount,
        sellUniswapRouterPath2,
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
        "Trader should have a balance of 8000 BTokens",
      )

      assertBNEq(
        aliceATokenPreSell <
          (await userToken.balanceOf(aliceAccount)).toNumber(),
        true,
        "Trader should have a more Payment Token than before",
      )
    })

    //Successful WTokenSell
    it("Executes a WTokenSell Exchange: Expect Successful Transaction", async () => {
      let aliceATokenPreWTokenSell = (
        await userToken.balanceOf(aliceAccount)
      ).toNumber()

      await deployedSirenExchange.bTokenBuy(
        seriesId,
        10000,
        uniswapRouterPath,
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

      await deployedAmm.withdrawCapital(100000, false, 100, {
        from: aliceAccount,
      })

      const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

      await deployedERC1155Controller.setApprovalForAll(
        deployedAmm.address,
        true,
      )
      await deployedSirenExchange.wTokenSell(
        seriesId,
        wTokenSellAmount,
        sellUniswapRouterPath2,
        0,
        deployedAmm.address,
        deadline.getTime(),
        uniswapV2RouterAddress,
        {
          from: aliceAccount,
        },
      )

      assertBNEq(
        1500,
        await deployedERC1155Controller.balanceOf(aliceAccount, wTokenIndex),
        "Trader should have a balance of 0 WTokens",
      )

      assertBNEq(
        aliceATokenPreWTokenSell <
          (await userToken.balanceOf(aliceAccount)).toNumber(),
        true,
        "Trader should have a more AToken than before",
      )
    })
  })

  describe("Failures", async () => {
    it("Execute a BTokenBuy Exchange Not Enough Payment Token: Expect revert", async () => {
      const bTokenBuyAmount = 10_000
      await erc20CollateralToken.approve(deployedAmm.address, 1000000000)
      await deployedAmm.provideCapital(1000000000, 0)

      await expectRevert(
        deployedSirenExchange.bTokenBuy(
          seriesId,
          bTokenBuyAmount,
          uniswapRouterPath,
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

      assertBNEq(
        0,
        (
          await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex)
        ).toNumber(),
        "Trader should have no bTokens",
      )
      assertBNEq(
        (await userToken.balanceOf(aliceAccount)).toNumber(),
        aliceATokenPreAmount,
        "Trader should have the same amount of collateral Token as before",
      )
    })

    it("Execute a BTokenSell With Not Enough BTokens: Expect a revert", async () => {
      await deployedSirenExchange.bTokenBuy(
        seriesId,
        10000,
        uniswapRouterPath,
        tokenAmountInMaximum,
        deployedAmm.address,
        deadline.getTime(),
        uniswapV2RouterAddress,
        {
          from: aliceAccount,
        },
      )

      const bTokenSellAmount = 11_000

      assertBNEq(
        10000,
        await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
        "Trader should have no BTokens",
      )

      assertBNEq(
        10000,
        await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
        "Trader should have 10_000 BTokens",
      )

      await deployedERC1155Controller.setApprovalForAll(
        deployedSirenExchange.address,
        true,
        {
          from: aliceAccount,
        },
      )

      await expectRevert(
        deployedSirenExchange.bTokenSell(
          seriesId,
          bTokenSellAmount,
          sellUniswapRouterPath2,
          bTokenSellAmount,
          deployedAmm.address,
          deadline.getTime(),
          uniswapV2RouterAddress,
          {
            from: aliceAccount,
          },
        ),
        ERROR_MESSAGES.MINIMUM_TOKENS_TO_HIGH,
      )

      await expectRevert(
        deployedSirenExchange.bTokenSell(
          seriesId,
          1000,
          sellUniswapRouterPath2,
          10000,
          deployedAmm.address,
          deadline.getTime(),
          uniswapV2RouterAddress,
          {
            from: aliceAccount,
          },
        ),
        ERROR_MESSAGES.MINIMUM_TOKENS_TO_HIGH,
      )

      await expectRevert(
        deployedSirenExchange.bTokenSell(
          seriesId,
          bTokenSellAmount,
          sellUniswapRouterPath2,
          0,
          deployedAmm.address,
          deadline.getTime(),
          uniswapV2RouterAddress,
          {
            from: aliceAccount,
          },
        ),
        ERROR_MESSAGES.NOT_ENOUGH_BTOKENS_SENT,
      )
    })
  })
})
