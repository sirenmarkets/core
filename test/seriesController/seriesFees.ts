/* global artifacts contract it assert */
import { time } from "@openzeppelin/test-helpers"
import { contract, assert } from "hardhat"
import {
  SimpleTokenInstance,
  SeriesControllerInstance,
  ERC1155ControllerInstance,
  PriceOracleInstance,
} from "../../typechain"

import { setupSingletonTestContracts, setupSeries } from "../util"

let deployedSeriesController: SeriesControllerInstance
let deployedERC1155Controller: ERC1155ControllerInstance
let deployedPriceOracle: PriceOracleInstance

let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance
let collateralToken: SimpleTokenInstance

let expiration: number

const FEE_RECEIVER_ADDRESS = "0x000000000000000000000000000000000000dEaD"

/**
 * Testing the flows for the Series Contract
 */
contract("Series Fees", (accounts) => {
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const carolAccount = accounts[3]

  beforeEach(async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      deployedERC1155Controller,
      deployedPriceOracle,
      expiration,
    } = await setupSingletonTestContracts({
      feeReceiver: FEE_RECEIVER_ADDRESS,
      exerciseFee: 10,
      closeFee: 20,
      claimFee: 30,
      oraclePrice: 15_000e8,
    }))
  })

  it("Sends fees to the owner account", async () => {
    // Amount we will be minting
    const MINT_AMOUNT = 10000

    // Give Alice 10000 tokens
    await underlyingToken.mint(aliceAccount, MINT_AMOUNT)

    // Give Carol collateral that she will close
    await underlyingToken.mint(carolAccount, MINT_AMOUNT)

    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now

    // these tests rely on precise and reliable timing, so to ensure we always have the
    // same time duration to expiration we set the current time to be 2 days prior
    // to expiration
    await time.increaseTo(expiration - twoDays)

    // Price ratio will be 10k base units of usdc per wbtc
    const strikePrice = 10_000e8

    const { seriesId } = await setupSeries({
      deployedSeriesController,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration,
      restrictedMinters: [aliceAccount, carolAccount],
      strikePrice: strikePrice.toString(),
      isPutOption: false,
    })

    // Save off the tokens
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    // approve the amount and mint alice some options
    await underlyingToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: aliceAccount,
      },
    )
    await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
      from: aliceAccount,
    })

    // Send the bTokens from alice to Bob
    await deployedERC1155Controller.safeTransferFrom(
      aliceAccount,
      bobAccount,
      bTokenIndex,
      MINT_AMOUNT,
      "0x0",
      { from: aliceAccount },
    )

    // Carol will mint and close
    await underlyingToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: carolAccount,
      },
    )
    await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
      from: carolAccount,
    })
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: carolAccount },
    )
    await deployedSeriesController.closePosition(seriesId, MINT_AMOUNT, {
      from: carolAccount,
    })

    // Carols accounts should have mint amount minus fee
    const collateralFeeForCarol = MINT_AMOUNT * 0.002
    assert.equal(
      (await underlyingToken.balanceOf(carolAccount)).toNumber(),
      MINT_AMOUNT - collateralFeeForCarol,
      "carol should have had fees deducted",
    )

    // Bob redeems only half of bTokens
    let bobBTokenAmount = MINT_AMOUNT / 2

    // Move time ahead so we're within the exercise window
    await time.increaseTo(expiration)

    // now that we advanced forward to the expiration date, we can set the Series' matching
    // settlement price on the PriceOracle
    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    // Only redeem half
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: bobAccount },
    )
    await deployedSeriesController.exerciseOption(
      seriesId,
      bobBTokenAmount,
      true,
      {
        from: bobAccount,
      },
    )

    // Bob should have paid 0.1% to redeem
    const collateralPrice = (
      await deployedPriceOracle.getCurrentPrice(
        underlyingToken.address,
        priceToken.address,
      )
    ).toNumber()
    let writerShare = Math.floor(
      bobBTokenAmount * (strikePrice / collateralPrice),
    )
    let buyersShare = bobBTokenAmount - writerShare

    const bobCollateralFee = Math.floor(buyersShare * 0.001)
    assert.equal(
      (await underlyingToken.balanceOf(bobAccount)).toNumber(),
      buyersShare - bobCollateralFee,
      "bob should end up with half of collateral minus fee",
    )

    assert.equal(
      (
        await deployedERC1155Controller.optionTokenTotalSupply(bTokenIndex)
      ).toNumber(),
      MINT_AMOUNT / 2,
      "half the bToken should be remaining after Bob burned the first half",
    )

    // Should succeed from Alice
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: aliceAccount },
    )
    await deployedSeriesController.claimCollateral(seriesId, MINT_AMOUNT, {
      from: aliceAccount,
    })

    writerShare =
      writerShare +
      Math.floor(MINT_AMOUNT * (strikePrice / collateralPrice) * 0.5)
    buyersShare = MINT_AMOUNT - writerShare

    // Alice should have spent 0.3% in fees to claim collateral
    const aliceClaimCollateralFee = Math.floor(writerShare * 0.003)

    // Alice should have her claim of collateral minus fees
    assert.equal(
      (await underlyingToken.balanceOf(aliceAccount)).toNumber(),
      writerShare - aliceClaimCollateralFee,
      "alice should end up with half of collateral minus fees",
    )

    // Owner account should end up with all fees collected
    assert.equal(
      (await underlyingToken.balanceOf(FEE_RECEIVER_ADDRESS)).toNumber(),
      collateralFeeForCarol + bobCollateralFee + aliceClaimCollateralFee,
      "owner should have collateral fees added",
    )

    assert.equal(
      (
        await deployedERC1155Controller.optionTokenTotalSupply(wTokenIndex)
      ).toNumber(),
      0,
      "all wTokens should have been exercised",
    )

    // should get the same option token total supplies, but fetching in batch
    const totalSupplies = await deployedERC1155Controller.optionTokenTotalSupplyBatch(
      [bTokenIndex, wTokenIndex],
    )
    assert.equal(totalSupplies[0].toNumber(), MINT_AMOUNT / 2)
    assert.equal(totalSupplies[1].toNumber(), 0)
  })
})
