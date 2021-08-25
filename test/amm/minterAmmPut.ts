/* global artifacts contract it assert */
import { time, expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract } from "hardhat"
import {
  SimpleTokenInstance,
  MinterAmmInstance,
  SeriesControllerInstance,
  ERC1155ControllerInstance,
  SimpleTokenContract,
} from "../../typechain"

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

import { setupAllTestContracts, assertBNEq, ONE_WEEK_DURATION } from "../util"

let deployedSeriesController: SeriesControllerInstance
let deployedERC1155Controller: ERC1155ControllerInstance
let deployedAmm: MinterAmmInstance

let collateralToken: SimpleTokenInstance

let expiration: number
let seriesId: string

const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

const ERROR_MESSAGES = {
  MIN_TRADE_SIZE: "Buy/Sell amount below min size",
}

contract("AMM Put Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  beforeEach(async () => {
    ;({
      collateralToken,
      deployedAmm,
      seriesId,
      deployedSeriesController,
      deployedERC1155Controller,
      expiration,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: BTC_ORACLE_PRICE,
      isPutOption: true,
    }))
  })

  it("Provides capital without trading", async () => {
    // Providing capital before approving should fail
    await expectRevert.unspecified(deployedAmm.provideCapital(10000, 0))

    // Approve collateral
    await collateralToken.mint(ownerAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "10000",
      lpTokensMinted: "10000",
    })

    // Collateral should be moved away from Owner
    assertBNEq(
      await collateralToken.balanceOf(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 10k collateral should be in the AMM.
    assertBNEq(
      await collateralToken.balanceOf(deployedAmm.address),
      10000,
      "Collateral should have been used to mint",
    )

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmm.getTotalPoolValue(true),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    // 0 bTokens should be in the AMM
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      0,
      "No bTokens should be in the AMM yet",
    )

    // 0 of wTokens should be in the AMM
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      0,
      "No wTokens should be in the AMM yet",
    )

    // LP tokens should have been given out
    assertBNEq(
      await lpToken.balanceOf(ownerAccount),
      10000,
      "lp tokens should have been minted",
    )

    // Now there are 10k lpTokens in the AMM...
    // If another user deposits another 1k collateral, it should increase
    // the number of lpTokens by 1000
    await collateralToken.mint(aliceAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Provide capital
    ret = await deployedAmm.provideCapital(1000, 0, { from: aliceAccount })

    expectEvent(ret, "LpTokensMinted", {
      minter: aliceAccount,
      collateralAdded: "1000",
      lpTokensMinted: "1000",
    })

    assertBNEq(
      await lpToken.balanceOf(aliceAccount),
      1000,
      "lp tokens should have been minted",
    )

    // Now let's withdraw half of alice's lp tokens (she has 1000 lp tokens)
    ret = await deployedAmm.withdrawCapital(500, true, 500, {
      from: aliceAccount,
    })

    // Check the math
    expectEvent(ret, "LpTokensBurned", {
      redeemer: aliceAccount,
      collateralRemoved: "500",
      lpTokensBurned: "500",
    })
  })

  it("Provides and immediately withdraws capital without trading", async () => {
    // Approve collateral
    await collateralToken.mint(ownerAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "10000",
      lpTokensMinted: "10000",
    })

    // Collateral should be moved away from Owner
    assertBNEq(
      await collateralToken.balanceOf(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 10k collateral should be in the AMM.
    assertBNEq(
      await collateralToken.balanceOf(deployedAmm.address),
      10000,
      "Collateral should have been used to mint",
    )

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmm.getTotalPoolValue(true),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    // 0 bTokens should be in the AMM
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      0,
      "No bTokens should be in the AMM yet",
    )

    // 0 of wTokens should be in the AMM
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      0,
      "No wTokens should be in the AMM yet",
    )

    // LP tokens should have been given out
    assertBNEq(
      await lpToken.balanceOf(ownerAccount),
      10000,
      "lp tokens should have been minted",
    )

    // Now let's withdraw all of the owner's lpTokens (owner should have 10000 lp tokens)
    ret = await deployedAmm.withdrawCapital(10000, true, 10000)

    // Check the math
    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "10000",
      lpTokensBurned: "10000",
    })

    // LP tokens should have been given out
    assertBNEq(
      await lpToken.balanceOf(ownerAccount),
      0,
      "all lp tokens should have been withdraw",
    )

    // Collateral should be moved away from AMM
    assertBNEq(
      await collateralToken.balanceOf(deployedAmm.address),
      0,
      "AMM should have no collateral",
    )

    // Collateral should be moved to Owner
    assertBNEq(
      await collateralToken.balanceOf(ownerAccount),
      10000,
      "Owner should have the same amount of collateral they had prior to providing capital",
    )
  })

  it("Provides capital with trading", async () => {
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    const capitalAmount = 10_000
    // 10_000 * 150
    const capitalCollateral =
      await deployedSeriesController.getCollateralPerOptionToken(
        seriesId,
        capitalAmount,
      )

    console.log(`capitalCollateral: ${capitalCollateral}`)

    // Approve collateral
    await collateralToken.mint(ownerAccount, capitalCollateral)
    await collateralToken.approve(deployedAmm.address, capitalCollateral)

    // Provide capital
    let ret = await deployedAmm.provideCapital(capitalCollateral, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: capitalCollateral,
      lpTokensMinted: capitalCollateral,
    })

    // Total assets value in the AMM should be .
    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toString(),
      (10_000 * STRIKE_PRICE) / (1e8 * 100), // see getCollateralPerOptionToken for this calculation
      "AMM total pool value incorrect",
    )

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    const aliceAmount = 1_000
    const aliceCollateral =
      await deployedSeriesController.getCollateralPerOptionToken(
        seriesId,
        aliceAmount,
      )

    // Now let's do some trading from another account
    await collateralToken.mint(aliceAccount, aliceCollateral)
    await collateralToken.approve(deployedAmm.address, aliceCollateral, {
      from: aliceAccount,
    })

    // Check that AMM calculates correct bToken price
    assertBNEq(
      (await deployedAmm.getPriceForSeries(seriesId)).toString(),
      "99966666666666666", // 0.066 (instrinsic) + 0.033 (extrinsic)
      "incorrect bToken price calculated by AMM",
    )

    // Buy bTokens
    const bTokenBuyAmount = 3_000
    let premium = await deployedAmm.bTokenGetCollateralIn(
      seriesId,
      bTokenBuyAmount,
    )
    ret = await deployedAmm.bTokenBuy(seriesId, bTokenBuyAmount, premium, {
      from: aliceAccount,
    })
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      bTokenBuyAmount,
      "Trader should receive purchased bTokens",
    )
    assertBNEq(
      (await collateralToken.balanceOf(aliceAccount)).toString(),
      91217, // started with capitalCollateral, then paid 58783 USDC for 3000 tokens at (0.099 * 150) + slippage
      "Trader should pay correct collateral amount",
    )
    const bTokenPaymentAmount = aliceCollateral.toNumber() - 91217

    // 3000 * 150
    const bTokenBuyCollateral =
      await deployedSeriesController.getCollateralPerOptionToken(
        seriesId,
        bTokenBuyAmount,
      )
    let ammCollateralAmount =
      capitalCollateral.toNumber() -
      bTokenBuyCollateral.toNumber() +
      bTokenPaymentAmount
    assertBNEq(
      (await collateralToken.balanceOf(deployedAmm.address)).toString(),
      ammCollateralAmount,
      "AMM should have correct collateral amount left",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      bTokenBuyAmount, // same amount as bTokens bought
      "AMM should have correct amount of residual wTokens",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      0,
      "No residual bTokens should be in the AMM",
    )
    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toString(),
      1513783, // ammCollateralAmount + bTokenBuyCollateral * (1 - 0.099) (btw, 1513783 > 1500000 - LPs are making money!!!)
      "Total assets value in the AMM should be correct",
    )

    // Now that the total pool value is 1513783...
    // If another user deposits another 1000 * 150 collateral, it should increase pool value
    // by ~9.9% and mint correct amount of LP tokens
    const bobAmount = 1_000
    const bobCollateral =
      await deployedSeriesController.getCollateralPerOptionToken(
        seriesId,
        bobAmount,
      ) // 150_000
    await collateralToken.mint(bobAccount, bobCollateral)
    await collateralToken.approve(deployedAmm.address, bobCollateral, {
      from: bobAccount,
    })

    // Provide capital
    ret = await deployedAmm.provideCapital(bobCollateral, 0, {
      from: bobAccount,
    })

    expectEvent(ret, "LpTokensMinted", {
      minter: bobAccount,
      collateralAdded: bobCollateral,
      lpTokensMinted: "148634",
    })

    assertBNEq(
      await lpToken.balanceOf(bobAccount),
      148634,
      "lp tokens should have been minted",
    )

    // Now let's withdraw all Bobs tokens to make sure Bob doesn't make money by simply
    // depositing and withdrawing collateral
    const bobCollateralWithdrawn = 149818
    ret = await deployedAmm.withdrawCapital(
      148634,
      true,
      bobCollateralWithdrawn,
      {
        from: bobAccount,
      },
    )

    // Check the math
    expectEvent(ret, "LpTokensBurned", {
      redeemer: bobAccount,
      collateralRemoved: bobCollateralWithdrawn.toString(),
      lpTokensBurned: "148634",
    })
    assertBNEq(
      await collateralToken.balanceOf(bobAccount),
      bobCollateralWithdrawn, // 149_818 < 150_000 - Bob lost some money, this is good!
      "Bob should lose some money on subsequent withdrawal",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(bobAccount, wTokenIndex),
      0,
      "No wTokens should be sent during partial withdrawal",
    )

    ret = await deployedAmm.withdrawCapital(capitalCollateral, false, 0, {
      from: ownerAccount,
    })

    expectEvent(ret, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: new BN(
        ammCollateralAmount +
          (bobCollateral.toNumber() - bobCollateralWithdrawn),
      ), // take the collateral left by bob
      lpTokensBurned: capitalCollateral,
    })
    assertBNEq(
      await deployedERC1155Controller.balanceOf(ownerAccount, wTokenIndex),
      bTokenBuyAmount,
      "Residual wTokens should be sent during full withdrawal",
    )

    // Make sure no tokens is left in the AMM
    assertBNEq(
      await collateralToken.balanceOf(deployedAmm.address),
      0,
      "No collateral token should be left in the AMM",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        wTokenIndex,
      ),
      0,
      "No wToken should be left in the AMM",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        deployedAmm.address,
        bTokenIndex,
      ),
      0,
      "No bToken should be left in the AMM",
    )
  })

  it("Enforces minimum trade size", async () => {
    // Verify it fails if min trade size is not met
    const minTradeSize = 1000
    await expectRevert(
      deployedAmm.bTokenBuy(seriesId, minTradeSize - 1, 1, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.MIN_TRADE_SIZE,
    )
    await expectRevert(
      deployedAmm.bTokenSell(seriesId, minTradeSize - 1, 1, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.MIN_TRADE_SIZE,
    )
  })

  it("Works in initial state", async () => {
    assertBNEq(
      // @ts-ignore
      (await deployedAmm.getAllSeries()).length,
      1,
      "Number of series should be 1",
    )

    assertBNEq(
      await deployedAmm.getTotalPoolValue(true),
      0,
      "Initial pool value should be 0",
    )

    const unredeemedCollateral =
      await deployedAmm.getCollateralValueOfAllExpiredOptionTokens()
    assertBNEq(
      unredeemedCollateral,
      0,
      "Initial unredeemedCollateral should be 0",
    )

    assertBNEq(
      await deployedAmm.getOptionTokensSaleValue(0),
      0,
      "Initial token sale value should be 0",
    )

    assertBNEq(
      await deployedAmm.getOptionTokensSaleValue(100),
      0,
      "Initial token sale value should be 0",
    )
  })
})
