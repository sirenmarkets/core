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
  AddressesProviderInstance,
  SeriesDeployerInstance,
} from "../../typechain"

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

import {
  setUpUniswap,
  setupAllTestContracts,
  assertBNEq,
  ONE_WEEK_DURATION,
} from "../util"
import { toBN } from "../testHelpers/blackScholes"
import { BigNumber } from "@ethersproject/bignumber"
import BN from "bn.js"

let deployedSirenExchange: SirenExchangeInstance
let deployedAmm: MinterAmmInstance

let expiration: number

let collateralToken: SimpleTokenInstance

let seriesId: string

let deployedERC1155Controller: ERC1155ControllerInstance

let uniswapRouterPath: Array<string>

let deployedSeriesController: SeriesControllerInstance

let deployedSeriesDeployer: SeriesDeployerInstance

let deployedAddressesProvider: AddressesProviderInstance

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
      expiration,
      deployedERC1155Controller,
      deployedSeriesController,
      deployedAddressesProvider,
      deployedSeriesDeployer,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: BTC_ORACLE_PRICE,
    })),
      ({ uniswapV2RouterAddress, deployedSirenExchange, uniswapRouterPath } =
        await setUpUniswap(collateralToken, deployedAddressesProvider))

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

      //Siren Exchange should not hold tokens in the contract at all
      assertBNEq(
        0,
        (await userToken.balanceOf(deployedSirenExchange.address)).toNumber(),
        "SirenExchange should have a balance of 0 userTokens",
      )
      assertBNEq(
        0,
        (
          await collateralToken.balanceOf(deployedSirenExchange.address)
        ).toNumber(),
        "SirenExchange should have a balance of 0 collateralToken",
      )
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

      //Siren Exchange should not hold tokens in the contract at all
      assertBNEq(
        0,
        (await userToken.balanceOf(deployedSirenExchange.address)).toNumber(),
        "SirenExchange should have a balance of 0 userTokens",
      )
      assertBNEq(
        0,
        (
          await collateralToken.balanceOf(deployedSirenExchange.address)
        ).toNumber(),
        "SirenExchange should have a balance of 0 collateralToken",
      )
    })

    it("Tries to Execute a bTokenBuyForNewSeries Exchange", async () => {
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
      const min = 100
      const max = 1600
      const increment = 100

      const ammUnderlyingToken = await deployedAmm.underlyingToken()
      const ammCollateralToken = await deployedAmm.collateralToken()
      const ammPriceToken = await deployedAmm.priceToken()

      sellUniswapRouterPath2 = [
        uniswapRouterPath[0],
        uniswapRouterPath[1],
        ammUnderlyingToken,
      ]
      const tokens = {
        underlyingToken: ammUnderlyingToken,
        collateralToken: ammCollateralToken,
        priceToken: ammPriceToken,
      }

      const series = {
        tokens,
        expirationDate: expiration + ONE_WEEK_DURATION,
        isPutOption: false,
        strikePrice: STRIKE_PRICE.toString(),
      }

      await deployedSeriesController.updateAllowedExpirations([
        expiration + ONE_WEEK_DURATION,
      ])

      const ret = await deployedSeriesDeployer.updateAllowedTokenStrikeRanges(
        ammUnderlyingToken,
        min,
        max,
        increment,
      )
      await deployedSirenExchange.bTokenBuyForNewSeries(
        bTokenBuyAmount,
        uniswapRouterPath,
        tokenAmountInMaximum,
        deployedAmm.address,
        deadline.getTime(),
        uniswapV2RouterAddress,
        series,
        {
          from: aliceAccount,
        },
      )
      let afterCount = await deployedSeriesController.latestIndex()
      let big1 = new BN("1")
      assertBNEq(
        bTokenBuyAmount,
        (
          await deployedERC1155Controller.balanceOf(
            aliceAccount,
            await deployedSeriesController.bTokenIndex(afterCount.sub(big1)),
          )
        ).toNumber(),
        "Trader should have a balance of 10_000 BTokens",
      )

      assertBNEq(
        aliceATokenPreAmount >
          (await userToken.balanceOf(aliceAccount)).toNumber(),
        true,
        "Trader should have a less Payment Token than before",
      )

      assertBNEq(
        0,
        (await userToken.balanceOf(deployedSirenExchange.address)).toNumber(),
        "SirenExchange should have a balance of 0 userTokens",
      )
      assertBNEq(
        0,
        (
          await collateralToken.balanceOf(deployedSirenExchange.address)
        ).toNumber(),
        "SirenExchange should have a balance of 0 collateralToken",
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
      //Siren Exchange should not hold tokens in the contract at all
      assertBNEq(
        0,
        (await userToken.balanceOf(deployedSirenExchange.address)).toNumber(),
        "SirenExchange should have a balance of 0 userTokens",
      )
      assertBNEq(
        0,
        (
          await collateralToken.balanceOf(deployedSirenExchange.address)
        ).toNumber(),
        "SirenExchange should have a balance of 0 collateralToken",
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
      //Siren Exchange should not hold tokens in the contract at all
      assertBNEq(
        0,
        (await userToken.balanceOf(deployedSirenExchange.address)).toNumber(),
        "SirenExchange should have a balance of 0 userTokens",
      )
      assertBNEq(
        0,
        (
          await collateralToken.balanceOf(deployedSirenExchange.address)
        ).toNumber(),
        "SirenExchange should have a balance of 0 collateralToken",
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
      //Siren Exchange should not hold tokens in the contract at all
      assertBNEq(
        0,
        (await userToken.balanceOf(deployedSirenExchange.address)).toNumber(),
        "SirenExchange should have a balance of 0 userTokens",
      )
      assertBNEq(
        0,
        (
          await collateralToken.balanceOf(deployedSirenExchange.address)
        ).toNumber(),
        "SirenExchange should have a balance of 0 collateralToken",
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
      //Siren Exchange should not hold tokens in the contract at all
      assertBNEq(
        0,
        (await userToken.balanceOf(deployedSirenExchange.address)).toNumber(),
        "SirenExchange should have a balance of 0 userTokens",
      )
      assertBNEq(
        0,
        (
          await collateralToken.balanceOf(deployedSirenExchange.address)
        ).toNumber(),
        "SirenExchange should have a balance of 0 collateralToken",
      )
    })
  })
})
