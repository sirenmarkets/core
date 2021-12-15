import { time, expectRevert, BN } from "@openzeppelin/test-helpers"
import { contract } from "hardhat"
import {
  SeriesControllerInstance,
  ERC1155ControllerInstance,
  SeriesVaultInstance,
  SimpleTokenInstance,
} from "../../typechain"

let deployedSeriesController: SeriesControllerInstance
let deployedVault: SeriesVaultInstance
let deployedERC1155Controller: ERC1155ControllerInstance

let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance
let collateralToken: SimpleTokenInstance

let expiration: number
let seriesId: string
let restrictedMinters: string[]

import { assertBNEq, setupAllTestContracts } from "../util"

contract("SeriesController close", (accounts) => {
  const aliceAccount = accounts[1]

  beforeEach(() => {
    restrictedMinters = [aliceAccount]
  })

  it("Can close out a Call series", async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      deployedVault,
      deployedERC1155Controller,
      expiration,
      seriesId,
    } = await setupAllTestContracts({
      restrictedMinters,
      closeFee: 500, // 5%
      strikePrice: new BN(10000).mul(new BN(10).pow(new BN(18))).toString(),
    }))

    // Amount we will be minting
    const MINT_AMOUNT = 10000

    // Give Alice 100 tokens
    await underlyingToken.mint(aliceAccount, MINT_AMOUNT)

    // give Alice some tokens so we can later close them
    await collateralToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: aliceAccount,
      },
    )
    await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
      from: aliceAccount,
    })

    // approve and close the position

    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: aliceAccount },
    )

    await deployedSeriesController.closePosition(seriesId, MINT_AMOUNT / 5, {
      from: aliceAccount,
    })

    // check to make sure the balances of different assets are as expected

    const collateralReceived = MINT_AMOUNT / 5
    const feeAmount = collateralReceived * 0.05

    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        aliceAccount,
        await deployedSeriesController.wTokenIndex(seriesId),
      ),
      MINT_AMOUNT * (4 / 5),
      "closePosition did not burn the correct number of wToken",
    )

    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        aliceAccount,
        await deployedSeriesController.bTokenIndex(seriesId),
      ),
      MINT_AMOUNT * (4 / 5),
      "closePosition did not burn the correct number of bToken",
    )

    assertBNEq(
      await deployedSeriesController.getSeriesERC20Balance(seriesId),
      MINT_AMOUNT * (4 / 5),
      "closePosition did not remove collateral from the controller",
    )

    assertBNEq(
      await collateralToken.balanceOf(deployedVault.address),
      MINT_AMOUNT * (4 / 5),
      "closePosition did not remove collateral from the vault",
    )

    assertBNEq(
      await collateralToken.balanceOf(aliceAccount),
      MINT_AMOUNT / 5 - feeAmount,
      "closePosition did not remove collateral from the vault",
    )

    // prove that we cannot close a position if the Series is expired

    await time.increaseTo(expiration)

    await expectRevert(
      deployedSeriesController.closePosition(seriesId, MINT_AMOUNT),
      "Series Not Open",
    )
  })

  it("Can close out a Put series", async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      deployedVault,
      deployedERC1155Controller,
      expiration,
      seriesId,
    } = await setupAllTestContracts({
      restrictedMinters,
      closeFee: 500, // 5%
      strikePrice: new BN(10000).mul(new BN(10).pow(new BN(18))).toString(),
      isPutOption: true,
    }))

    // Amount we will be minting
    const MINT_AMOUNT = new BN(10000)

    const collateralAmount = new BN(
      (
        await deployedSeriesController.getCollateralPerOptionToken(
          seriesId,
          MINT_AMOUNT,
        )
      ).toString(),
    )

    // Give Alice 100 tokens
    await priceToken.mint(aliceAccount, collateralAmount)

    // give Alice some tokens so we can later close them
    await collateralToken.approve(
      deployedSeriesController.address,
      collateralAmount,
      {
        from: aliceAccount,
      },
    )
    await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
      from: aliceAccount,
    })

    // approve and close the position

    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: aliceAccount },
    )

    await deployedSeriesController.closePosition(seriesId, MINT_AMOUNT / 5, {
      from: aliceAccount,
    })

    // check to make sure the balances of different assets are as expected

    const collateralReceived = collateralAmount / 5
    const feeAmount = collateralReceived * 0.05

    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        aliceAccount,
        await deployedSeriesController.wTokenIndex(seriesId),
      ),
      MINT_AMOUNT * (4 / 5),
      "closePosition did not burn the correct number of wToken",
    )

    assertBNEq(
      await deployedERC1155Controller.balanceOf(
        aliceAccount,
        await deployedSeriesController.bTokenIndex(seriesId),
      ),
      MINT_AMOUNT * (4 / 5),
      "closePosition did not burn the correct number of bToken",
    )

    assertBNEq(
      await deployedSeriesController.getSeriesERC20Balance(seriesId),
      collateralAmount * (4 / 5),
      "closePosition did not remove collateral from the controller",
    )

    assertBNEq(
      await collateralToken.balanceOf(deployedVault.address),
      collateralAmount * (4 / 5),
      "closePosition did not remove collateral from the vault",
    )

    assertBNEq(
      await collateralToken.balanceOf(aliceAccount),
      collateralAmount / 5 - feeAmount,
      "closePosition did not remove collateral from the vault",
    )
  })
})
