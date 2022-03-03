/* global artifacts contract it assert */
import { time, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract, assert } from "hardhat"
import {
  MockPriceOracleInstance,
  SimpleTokenContract,
  SimpleTokenInstance,
  SeriesControllerInstance,
  ERC1155ControllerInstance,
  PriceOracleInstance,
} from "../../typechain"

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

import { setupSingletonTestContracts, setupSeries } from "../util"

contract("Series Scenarios", (accounts) => {
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  // Set the expiration to 2 days from now
  let expiration: number
  let deployedMockPriceOracle: MockPriceOracleInstance
  let deployedPriceOracle: PriceOracleInstance
  let deployedSeriesController: SeriesControllerInstance
  let deployedERC1155Controller: ERC1155ControllerInstance
  let underlyingToken: SimpleTokenInstance
  let priceToken: SimpleTokenInstance
  let collateralToken: SimpleTokenInstance

  beforeEach(async () => {})

  // Do a covered call - lock up bitcoin at a specific price
  it("Calculates call option decimals for wBTC and USDC at $20k strike", async () => {
    const wBTCDecimals = 8

    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      deployedERC1155Controller,
      deployedPriceOracle,
      deployedMockPriceOracle,
      expiration,
    } = await setupSingletonTestContracts())

    // Amount we will be minting equals 1 BTC - 100,000,000
    const mintAmount = new BN(10).pow(new BN(wBTCDecimals))

    const strikePrice = 20_000e8

    // Give Alice the collateral
    await collateralToken.mint(aliceAccount, mintAmount)

    // Erase all previous rounds
    await deployedMockPriceOracle.reset()
    const oraclePrice = 22_000 * 10 ** 8 // 22k
    await deployedMockPriceOracle.addRound(oraclePrice, expiration, expiration)

    const { seriesId } = await setupSeries({
      deployedSeriesController,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration,
      restrictedMinters: [aliceAccount, bobAccount],
      strikePrice: strikePrice.toString(),
      isPutOption: false,
    })

    // Save off the tokens
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    // approve the amount and mint alice some options
    await collateralToken.approve(
      deployedSeriesController.address,
      mintAmount,
      {
        from: aliceAccount,
      },
    )
    await deployedSeriesController.mintOptions(seriesId, mintAmount, {
      from: aliceAccount,
    })

    // Send the bTokens from alice to Bob
    await deployedERC1155Controller.safeTransferFrom(
      aliceAccount,
      bobAccount,
      bTokenIndex,
      mintAmount,
      "0x0",
      { from: aliceAccount },
    )

    // Move the block time into the future so the option can be redeemed
    await time.increaseTo(expiration)

    // now that we advanced forward to the expiration date, we can set the Series' matching
    // settlement price on the PriceOracle
    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    const collateralPrice = (
      await deployedPriceOracle.getCurrentPrice(
        underlyingToken.address,
        priceToken.address,
      )
    ).toNumber()
    const writerShare = Math.floor((mintAmount * strikePrice) / collateralPrice)
    const buyersShare = mintAmount - writerShare

    // Bob exercises first half pre-expiry
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: bobAccount },
    )
    await deployedSeriesController.exerciseOption(
      seriesId,
      mintAmount / 2,
      true,
      {
        from: bobAccount,
      },
    )
    assert.equal(
      (await collateralToken.balanceOf(bobAccount)).toNumber(),
      buyersShare / 2,
      "bob should end up with half of buyer's share",
    )

    // Alice claims her remaining collateral with wToken
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: aliceAccount },
    )
    await deployedSeriesController.claimCollateral(seriesId, mintAmount, {
      from: aliceAccount,
    })

    // Bob exercises the other half post-expiry
    await deployedSeriesController.exerciseOption(
      seriesId,
      mintAmount / 2,
      true,
      {
        from: bobAccount,
      },
    )

    // Alice should have writer's share
    const writerCollateralBalance = (
      await collateralToken.balanceOf(aliceAccount)
    ).toNumber()
    assert.equal(
      writerCollateralBalance,
      writerShare,
      "alice should end up with writer's share",
    )

    // Bob should have buyer's share
    const buyerCollateralBalance = (
      await collateralToken.balanceOf(bobAccount)
    ).toNumber()
    assert.equal(
      buyerCollateralBalance,
      buyersShare,
      "bob should end up with buyer's share",
    )

    // Check that total collateral is same as before
    assert.equal(
      buyerCollateralBalance + writerCollateralBalance,
      mintAmount,
      "total collateral should be the same",
    )
  })

  it("Calculates put option decimals for USDC and wBTC at $12k strike", async () => {
    const wBTCDecimals = 8
    const underlyingDecimals = wBTCDecimals
    const USDCDecimals = 6

    const underlyingToken = await SimpleToken.new()
    await underlyingToken.initialize("Wrapped BTC", "WBTC", wBTCDecimals)

    const priceToken = await SimpleToken.new()
    await priceToken.initialize("USD Coin", "USDC", USDCDecimals)
    const collateralToken = priceToken

    const oraclePrice = 10_000 * 10 ** 8 // 10k, ITM

    ;({
      deployedSeriesController,
      deployedERC1155Controller,
      deployedPriceOracle,
      deployedMockPriceOracle,
      expiration,
    } = await setupSingletonTestContracts({
      underlyingToken,
      collateralToken,
      priceToken,
      oraclePrice,
    }))

    const strikePrice = 12_000e8

    const { seriesId } = await setupSeries({
      deployedSeriesController,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration,
      restrictedMinters: [aliceAccount, bobAccount],
      strikePrice: strikePrice.toString(),
      isPutOption: true,
    })

    // Save off the tokens
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    // collateral amount will be $12k USDC
    const mintAmount = new BN(1).mul(new BN(10).pow(new BN(underlyingDecimals)))

    // Bob mints options by locking up USDC, but because it's a put
    // we first need to convert the bToken amount into its equivalent
    // collateral (USDC) amount (which will be 12k * 1e6 * mintAmount)
    const mintCollateralEquivalent =
      await deployedSeriesController.getCollateralPerOptionToken(
        seriesId,
        mintAmount,
      )

    // Give BOB the collateralToken
    await priceToken.mint(bobAccount, mintCollateralEquivalent)

    await priceToken.approve(
      deployedSeriesController.address,
      mintCollateralEquivalent,
      {
        from: bobAccount,
      },
    )

    await deployedSeriesController.mintOptions(seriesId, mintAmount, {
      from: bobAccount,
    })

    assert.equal(
      (
        await deployedERC1155Controller.balanceOf(bobAccount, bTokenIndex)
      ).toNumber(),
      mintAmount,
      "bob should have b Token",
    )
    assert.equal(
      (
        await deployedERC1155Controller.balanceOf(bobAccount, wTokenIndex)
      ).toNumber(),
      mintAmount,
      "bob should have w Token",
    )
    assert.equal(
      (await priceToken.balanceOf(bobAccount)).toNumber(),
      0,
      "bob should have no USDC",
    )

    // Send the bTokens from bob to alice
    await deployedERC1155Controller.safeTransferFrom(
      bobAccount,
      aliceAccount,
      bTokenIndex,
      mintAmount,
      "0x0",
      { from: bobAccount },
    )
    assert.equal(
      (
        await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex)
      ).toNumber(),
      mintAmount,
      "alice should have all b Token",
    )

    // Move the block time into the future so the option can be exercised
    await time.increaseTo(expiration)

    // now that we advanced forward to the expiration date, we can set the Series' matching
    // settlement price on the PriceOracle
    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: aliceAccount },
    )
    let ret = await deployedSeriesController.exerciseOption(
      seriesId,
      mintAmount,
      true,
      {
        from: aliceAccount,
      },
    )

    assert.equal(
      (
        await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex)
      ).toNumber(),
      0,
      "alice should have no b Token",
    )

    // make sure alice got the right amount of USDC for her ITM PUT
    const collateralPrice = (
      await deployedPriceOracle.getCurrentPrice(
        underlyingToken.address,
        priceToken.address,
      )
    ).toNumber()
    const buyersShare =
      (strikePrice - collateralPrice) *
      10 ** (USDCDecimals - underlyingDecimals)
    const writersShare = mintCollateralEquivalent.toNumber() - buyersShare

    assert.equal(
      (await priceToken.balanceOf(aliceAccount)).toNumber(),
      buyersShare,
      "alice should have received correct amount of USDC",
    )

    assert.equal(
      2_000 * 10 ** USDCDecimals,
      buyersShare,
      "alice should have received 2k USDC",
    )

    // Bob claims his collateral with wToken
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: bobAccount },
    )
    ret = await deployedSeriesController.claimCollateral(seriesId, mintAmount, {
      from: bobAccount,
    })

    assert.equal(
      (await priceToken.balanceOf(bobAccount)).toNumber(),
      writersShare,
      "bob should have the full writers' share of USDC",
    )

    assert.equal(
      10_000 * 10 ** USDCDecimals,
      writersShare,
      "bob should have the full writers' share of USDC",
    )
  })
})
