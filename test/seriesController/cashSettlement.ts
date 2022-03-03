/* global artifacts contract it assert */
import { time, expectRevert, BN } from "@openzeppelin/test-helpers"
import seedRandom from "seedrandom"
import { contract, assert } from "hardhat"
import {
  MockPriceOracleInstance,
  PriceOracleInstance,
  SimpleTokenInstance,
  SeriesControllerInstance,
  ERC1155ControllerInstance,
} from "../../typechain"

import { getRandomInt, setupAllTestContracts } from "../util"

contract("Cash Settlement", (accounts) => {
  const minter = accounts[0]

  let deployedMockPriceOracle: MockPriceOracleInstance
  let deployedPriceOracle: PriceOracleInstance
  let deployedSeriesController: SeriesControllerInstance
  let deployedERC1155Controller: ERC1155ControllerInstance

  let underlyingToken: SimpleTokenInstance
  let priceToken: SimpleTokenInstance
  let collateralToken: SimpleTokenInstance
  let seriesId: string

  let expiration: number

  const wBTCDecimals = 8

  const STRIKE = 14_000e8
  const collateralPrice = 20_000 * 10 ** wBTCDecimals

  beforeEach(async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      deployedERC1155Controller,
      deployedPriceOracle,
      deployedMockPriceOracle,
      expiration,
      seriesId,
    } = await setupAllTestContracts({
      oraclePrice: collateralPrice,
      restrictedMinters: [minter],
      strikePrice: STRIKE.toString(),
    }))
  })

  it("claim before any exercises", async () => {
    // Amount we will be minting equals 100 BTC (100e8)
    const MINT_AMOUNT = new BN(100).mul(new BN(10).pow(new BN(wBTCDecimals)))

    // Save off the tokens
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

    // Give Alice the collateral
    await underlyingToken.mint(minter, MINT_AMOUNT)

    // approve the amount and mint some options
    await underlyingToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: minter,
      },
    )
    await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
      from: minter,
    })

    // Move the block time into the future so the contract is expired
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
      { from: minter },
    )
    await deployedSeriesController.claimCollateral(seriesId, MINT_AMOUNT)

    assert.equal(
      (
        await deployedERC1155Controller.balanceOf(minter, wTokenIndex)
      ).toNumber(),
      0,
      "minter have burned all the wToken",
    )

    const writerShare = Math.floor(
      (MINT_AMOUNT.toNumber() * STRIKE) / collateralPrice,
    )
    assert.equal(
      (await underlyingToken.balanceOf(minter)).toNumber(),
      writerShare,
      "minter should have received his share of the collateral",
    )
  })

  it("fuzz exercising options and claiming collateral with multiple users", async () => {
    // seed the random number generator so we can re-create a test if it fails
    const seed = Math.random()
    const rng = seedRandom(seed)
    console.log(`seed: ${seed}`)

    // Amount we will be minting equals 100 BTC - 100 * 100,000,000
    const MINT_AMOUNT = new BN(100).mul(new BN(10).pow(new BN(wBTCDecimals)))

    // Save off the tokens
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    // Give Alice the collateral
    await underlyingToken.mint(minter, MINT_AMOUNT)

    // approve the amount and mint some options
    await underlyingToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: minter,
      },
    )
    await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
      from: minter,
    })

    // disburse random amounts of the bTokens to each of the 9 non-minter accounts
    let bTokenRandomIntervals = makeRandomIntervals(MINT_AMOUNT, rng)
    const bTokenRandomDisbursements = []
    for (let i = 1; i < bTokenRandomIntervals.length; i++) {
      const amount = bTokenRandomIntervals[i] - bTokenRandomIntervals[i - 1]
      await deployedERC1155Controller.safeTransferFrom(
        minter,
        accounts[i],
        bTokenIndex,
        amount,
        "0x0",
      )

      bTokenRandomDisbursements.push({
        account: accounts[i],
        amount,
      })
    }

    assert.equal(
      (
        await deployedERC1155Controller.balanceOf(minter, bTokenIndex)
      ).toNumber(),
      0,
      "minter should have disbursed all the bToken",
    )

    // disburse random amounts of the wTokens to each of the 9 non-minter accounts
    let wTokenRandomIntervals = makeRandomIntervals(MINT_AMOUNT, rng)
    const wTokenRandomDisbursements = []
    for (let i = 1; i < wTokenRandomIntervals.length; i++) {
      const amount = wTokenRandomIntervals[i] - wTokenRandomIntervals[i - 1]
      await deployedERC1155Controller.safeTransferFrom(
        minter,
        accounts[i],
        wTokenIndex,
        amount,
        "0x0",
      )

      wTokenRandomDisbursements.push({
        account: accounts[i],
        amount,
      })
    }

    assert.equal(
      (
        await deployedERC1155Controller.balanceOf(minter, wTokenIndex)
      ).toNumber(),
      0,
      "minter should have disbursed all the wToken",
    )

    // now exercise all those random disbursements, and check that the intermediate amounts are correct.
    // partway through we advance the time past expiration, and the writers start claiming

    // Move the block time into the future so the contract is expired
    await time.increaseTo(expiration)
    let optionHasExpired = true

    // now that we advanced forward to the expiration date, we can set the Series' matching
    // settlement price on the PriceOracle
    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    while (
      bTokenRandomDisbursements.length !== 0 ||
      wTokenRandomDisbursements.length !== 0
    ) {
      if (optionHasExpired && wTokenRandomDisbursements.length !== 0) {
        const disbursement = wTokenRandomDisbursements.pop()
        // console.log(
        //   "claim disbursement: " +
        //     disbursement.amount +
        //     " " +
        //     disbursement.account,
        // )
        // console.log(
        //   `claim Series collateral: ${await collateralToken.balanceOf(
        //     deployedSeries.address,
        //   )}`,
        // )

        const priorBalance = await underlyingToken.balanceOf(
          disbursement.account,
        )

        const claimCalc = await deployedSeriesController.getClaimAmount(
          seriesId,
          disbursement.amount,
        )

        await deployedERC1155Controller.setApprovalForAll(
          deployedSeriesController.address,
          true,
          { from: disbursement.account },
        )
        await deployedSeriesController.claimCollateral(
          seriesId,
          disbursement.amount,
          {
            from: disbursement.account,
          },
        )

        const newBalance = await underlyingToken.balanceOf(disbursement.account)

        // Check calculated amount
        assert.equal(
          claimCalc[0].toString(),
          newBalance.sub(priorBalance).toString(),
          "Claim calculation should be correct",
        )

        // Check that claimed amount is correct
        const writerShare = Math.floor(
          (disbursement.amount * STRIKE) / collateralPrice,
        )
        assert.closeTo(
          newBalance.toNumber() - priorBalance.toNumber(),
          writerShare,
          5,
          "account should have its fair writer share",
        )
      }

      if (bTokenRandomDisbursements.length !== 0) {
        const disbursement = bTokenRandomDisbursements.pop()
        // console.log(
        //   "exercise disbursement: " +
        //     disbursement.amount +
        //     " " +
        //     disbursement.account,
        // )
        // console.log(
        //   `exercise Series collateral: ${await collateralToken.balanceOf(
        //     deployedSeries.address,
        //   )}`,
        // )

        const priorBalance = await underlyingToken.balanceOf(
          disbursement.account,
        )

        // Calculate to-be exercised amount
        const exerciseCalc = await deployedSeriesController.getExerciseAmount(
          seriesId,
          disbursement.amount,
        )

        await deployedERC1155Controller.setApprovalForAll(
          deployedSeriesController.address,
          true,
          { from: disbursement.account },
        )
        await deployedSeriesController.exerciseOption(
          seriesId,
          disbursement.amount,
          true,
          {
            from: disbursement.account,
          },
        )

        const newBalance = await underlyingToken.balanceOf(disbursement.account)

        assert.equal(
          exerciseCalc[0].toString(),
          newBalance.sub(priorBalance).toString(),
          "Exercise calculation should be correct",
        )

        // make sure each non-minter received their correct share of the collateral from exercising
        const writerShare = Math.floor(
          (disbursement.amount * STRIKE) / collateralPrice,
        )
        const buyersShare = disbursement.amount - writerShare

        assert.closeTo(
          exerciseCalc[0].toNumber(),
          buyersShare,
          5,
          "account should have its fair share of the exercise profit",
        )
      }
    }

    // make sure all of the option tokens were burned by checking that all
    // of the accounts that held option tokens now have 0
    for (let account of accounts) {
      assert.equal(
        (
          await deployedERC1155Controller.balanceOf(account, bTokenIndex)
        ).toNumber(),
        0,
        "all bTokens should be burned",
      )
      assert.equal(
        (
          await deployedERC1155Controller.balanceOf(account, wTokenIndex)
        ).toNumber(),
        0,
        "all wTokens should be burned",
      )
    }

    // and also check all option tokens were burned by verifying total supply is 0
    assert.equal(
      (
        await deployedERC1155Controller.optionTokenTotalSupply(bTokenIndex)
      ).toNumber(),
      0,
      "all bTokens should be burned",
    )
    assert.equal(
      (
        await deployedERC1155Controller.optionTokenTotalSupply(wTokenIndex)
      ).toNumber(),
      0,
      "all wTokens should be burned",
    )
    const totalSupplies =
      await deployedERC1155Controller.optionTokenTotalSupplyBatch([
        bTokenIndex,
        wTokenIndex,
      ])
    assert.equal(totalSupplies[0].toNumber(), 0)
    assert.equal(totalSupplies[1].toNumber(), 0)

    // make sure each non-minters received their correct share of the collateral from claiming
    for (let d of wTokenRandomDisbursements) {
      const actualWriterShare = (
        await collateralToken.balanceOf(d.account)
      ).toNumber()
      const expectedWriterShare = d.amount
      assert.equal(
        actualWriterShare,
        expectedWriterShare,
        `writer should have received ${expectedWriterShare} but instead received ${actualWriterShare}`,
      )
    }
  })

  it("should use the current oracle price when no settlement price is set", async () => {
    const afterExpiry = expiration + 24 * 60 * 60 // one day later at 8am UTC

    // setup some bTokens and wTokens
    const mintAmount = 1000 // use some arbitrary option token amount
    await underlyingToken.mint(minter, mintAmount)

    // approve the amount and mint some options
    await underlyingToken.approve(deployedSeriesController.address, mintAmount)
    await deployedSeriesController.mintOptions(seriesId, mintAmount)

    // when the contract is OPEN, we should be able to calculate the claim and exercise  amounts
    let claimCalc = await deployedSeriesController.getClaimAmount(
      seriesId,
      mintAmount,
    )
    let writerShare = Math.floor((mintAmount * STRIKE) / collateralPrice)
    assert.equal(claimCalc[0].toNumber(), writerShare)

    let exerciseCalc = await deployedSeriesController.getExerciseAmount(
      seriesId,
      mintAmount,
    )
    let buyerShare = Math.floor(mintAmount - claimCalc[0].toNumber())
    assert.equal(exerciseCalc[0].toNumber(), buyerShare)

    // move time ahead to after expiration, and ensure claim and exercise still use the current price

    await time.increaseTo(afterExpiry)

    await deployedMockPriceOracle.setLatestAnswer(collateralPrice)

    claimCalc = await deployedSeriesController.getClaimAmount(
      seriesId,
      mintAmount,
    )
    writerShare = Math.floor((mintAmount * STRIKE) / collateralPrice)
    assert.equal(claimCalc[0].toNumber(), writerShare)

    exerciseCalc = await deployedSeriesController.getExerciseAmount(
      seriesId,
      mintAmount,
    )
    buyerShare = Math.floor(mintAmount - claimCalc[0].toNumber())
    assert.equal(exerciseCalc[0].toNumber(), buyerShare)

    // set the settlement price, and we should see the Series uses that price instead of the current price
    const newCurrentPrice = 25_000 * 10 ** wBTCDecimals
    await deployedMockPriceOracle.reset()
    await deployedMockPriceOracle.setLatestAnswer(newCurrentPrice)
    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    const newClaimCalc = await deployedSeriesController.getClaimAmount(
      seriesId,
      mintAmount,
    )
    assert.notEqual(claimCalc[0].toNumber(), newClaimCalc[0].toNumber())

    const newExerciseCalc = await deployedSeriesController.getExerciseAmount(
      seriesId,
      mintAmount,
    )
    assert.notEqual(exerciseCalc[0].toNumber(), newExerciseCalc[0].toNumber())
  })

  it("should not be able to claimCollateral if !Expired", async () => {
    // Amount we will be minting equals 100 BTC - 100 * 100,000,000
    const MINT_AMOUNT = new BN(100).mul(new BN(10).pow(new BN(wBTCDecimals)))

    // Give Alice the collateral
    await underlyingToken.mint(minter, MINT_AMOUNT)

    // approve the amount and mint some options
    await underlyingToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: minter,
      },
    )
    await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
      from: minter,
    })

    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
    )
    await expectRevert(
      deployedSeriesController.claimCollateral(seriesId, MINT_AMOUNT),
      "!Expired",
    )

    // Move the block time into the future so the contract is expired
    await time.increaseTo(expiration)

    // now that we advanced forward to the expiration date, we can set the Series' matching
    // settlement price on the PriceOracle
    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    await deployedSeriesController.claimCollateral(seriesId, MINT_AMOUNT)
  })

  // helper function to make random amounts for the 9 non-minter accounts
  type rngFunc = () => number
  const makeRandomIntervals = (max: BN, rng: rngFunc) => {
    let randomIntervals = []
    randomIntervals.push(0)
    for (let i = 0; i < accounts.length - 2; i++) {
      randomIntervals.push(getRandomInt(max, rng))
    }
    randomIntervals.push(max.toNumber())
    return randomIntervals.sort((a, b) => a - b)
  }
})
