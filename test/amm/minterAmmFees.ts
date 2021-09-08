import { expectEvent, expectRevert, BN, time } from "@openzeppelin/test-helpers"
import { contract, assert } from "hardhat"
import {
  ERC1155ControllerInstance,
  SeriesControllerInstance,
  MinterAmmInstance,
  MinterAmmContract,
  SimpleTokenInstance,
} from "../../typechain"

import { setupAllTestContracts, assertBNEq, ONE_WEEK_DURATION } from "../util"

const MinterAmmFeeBased: MinterAmmContract = artifacts.require("MinterAmm")

const ERROR_MESSAGES = {
  B_TOKEN_BUY_SLIPPAGE: "Slippage exceeded",
  B_TOKEN_SELL_SLIPPAGE: "Slippage exceeded",
  UNAUTHORIZED: "Ownable: caller is not the owner",
}

let deployedERC1155Controller: ERC1155ControllerInstance
let deployedSeriesController: SeriesControllerInstance
let expiration: number
let seriesId: string
let underlyingToken: SimpleTokenInstance

/**
 * Testing MinterAmm volatility factor updates
 */
contract("AMM Fees", (accounts) => {
  const ownerAccount = accounts[0]
  const bobAccount = accounts[2]

  let deployedAmm: MinterAmmInstance

  beforeEach(async () => {
    ;({
      // @ts-ignore since we are upgrading to the proper logic
      deployedAmm,
      deployedERC1155Controller,
      deployedSeriesController,
      seriesId,
      underlyingToken,
    } = await setupAllTestContracts({}))
  })

  it("Updates Fee params", async () => {
    let deployedFeeAmm: MinterAmmInstance = await MinterAmmFeeBased.at(
      deployedAmm.address,
    )

    // Ensure an non-owner can't update fee params
    await expectRevert(
      deployedFeeAmm.setTradingFeeParams(
        new BN(100),
        new BN(200),
        accounts[2],
        {
          from: bobAccount,
        },
      ),
      ERROR_MESSAGES.UNAUTHORIZED,
    )

    // Set it from the owner account
    let ret = await deployedFeeAmm.setTradingFeeParams(
      new BN(100),
      new BN(200),
      accounts[2],
      {
        from: ownerAccount,
      },
    )

    expectEvent(ret, "TradeFeesUpdated", {
      newTradeFeeBasisPoints: new BN(100),
      newMaxOptionFeeBasisPoints: new BN(200),
      newFeeDestinationAddress: accounts[2],
    })

    // Verify it got set correctly
    assertBNEq(
      await deployedFeeAmm.tradeFeeBasisPoints(),
      new BN(100),
      "Trade fee should be set",
    )

    // Verify it got set correctly
    assertBNEq(
      await deployedFeeAmm.maxOptionFeeBasisPoints(),
      new BN(200),
      "Max fee should be set",
    )

    // Verify it got set correctly
    assert.equal(
      await deployedFeeAmm.feeDestinationAddress(),
      accounts[2],
      "Fee dest should be set",
    )
  })

  it("Buys and sells bTokens with fees", async () => {
    const aliceAccount = accounts[1]
    const feeDestination = accounts[2]
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000e8)
    await underlyingToken.approve(deployedAmm.address, 10000e8)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000e8, 0)

    // Approve collateral
    await underlyingToken.mint(aliceAccount, 10e8)
    await underlyingToken.approve(deployedAmm.address, 10e8, {
      from: aliceAccount,
    })

    // Enable fees
    await deployedAmm.setTradingFeeParams(
      new BN(3),
      new BN(1250),
      feeDestination,
      {
        from: ownerAccount,
      },
    )

    let feesCollected = 0

    // Buys success - ignore slippage and use a big number
    ret = await deployedAmm.bTokenBuy(seriesId, 10000, 1000e7, {
      from: aliceAccount,
    })

    // Check fees - fee on 10000 of bTokens should be 0.03% (3 basis points) => 3
    // Max fee should be 12.5% of amount of collateral required which is 2039 * 12.5% => 254
    expectEvent(ret, "TradeFeesPaid", {
      feePaidTo: feeDestination,
      feeAmount: "3", // the fee of 3 is less than 254 so lower fee is used
    })
    feesCollected += 3

    // Formula: 1/2 * (sqrt((Rr + Rc - Δr)^2 + 4 * Δr * Rc) + Δr - Rr - Rc) - fee
    expectEvent(ret, "BTokensBought", {
      buyer: aliceAccount,
      bTokensBought: "10000",
      collateralPaid: "2042", // 2039 to pay for option and 3 for fee => 2042
    })

    // Set the trade fee really high to verify the max collateral fee is used
    // 10% trade fee
    await deployedAmm.setTradingFeeParams(
      new BN(1000),
      new BN(1250),
      feeDestination,
      {
        from: ownerAccount,
      },
    )

    // Buys success - ignore slippage and use a big number
    ret = await deployedAmm.bTokenBuy(seriesId, 10000, 1000e7, {
      from: aliceAccount,
    })

    // Check fees - fee on 10000 of bTokens should be 10% (1000 basis points) => 10000
    // Max fee should be 12.5% of amount of collateral required which is 2039 * 12.5% => 254
    expectEvent(ret, "TradeFeesPaid", {
      feePaidTo: feeDestination,
      feeAmount: "254", // the fee of 254 is less than 10,000 so lower fee is used
    })
    feesCollected += 254

    // Check the amount bought
    expectEvent(ret, "BTokensBought", {
      buyer: aliceAccount,
      bTokensBought: "10000",
      collateralPaid: "2293", // 2039 to pay for option and 254 for fee => 2293
    })

    // Verify fees got sent
    assertBNEq(
      await underlyingToken.balanceOf(feeDestination),
      feesCollected,
      "Fees should have been collected in address",
    )

    // Set trade fee back
    await deployedAmm.setTradingFeeParams(
      new BN(3),
      new BN(1250),
      feeDestination,
      {
        from: ownerAccount,
      },
    )

    // Approve bTokens to trade for collateral
    await deployedERC1155Controller.setApprovalForAll(
      deployedAmm.address,
      true,
      {
        from: aliceAccount,
      },
    )

    // Sell into AMM - ignore slippage
    ret = await deployedAmm.bTokenSell(seriesId, 5000, 0, {
      from: aliceAccount,
    })

    // Verify fee events - collateral sent to user will be minus fee
    // Check fees - fee on 5000 of bTokens should be 0.03% (3 basis points) => 1
    // Max fee should be 12.5% of amount of collateral required which is 1020 * 12.5% => 127
    expectEvent(ret, "TradeFeesPaid", {
      feePaidTo: feeDestination,
      feeAmount: "1", // the fee of 1 is less than 127 so lower fee is used
    })
    feesCollected += 1

    // Check the amount bought
    expectEvent(ret, "BTokensSold", {
      seller: aliceAccount,
      bTokensSold: "5000",
      collateralPaid: "1019", // collateral closed out is 1020 minus the fee of 1
    })

    // Bump trade fee so that the max fee is used
    await deployedAmm.setTradingFeeParams(
      new BN(5000),
      new BN(1250),
      feeDestination,
      {
        from: ownerAccount,
      },
    )

    // Sell into AMM - ignore slippage
    ret = await deployedAmm.bTokenSell(seriesId, 5000, 0, {
      from: aliceAccount,
    })

    // Verify fee events - collateral sent to user will be minus fee
    // Check fees - fee on 5000 of bTokens should be 50% (5000 basis points) => 2500
    // Max fee should be 12.5% of amount of collateral required which is 1020 * 12.5% => 127
    expectEvent(ret, "TradeFeesPaid", {
      feePaidTo: feeDestination,
      feeAmount: "127", // the fee of 127 is less than 2500 so lower fee is used
    })
    feesCollected += 127

    // Check the amount bought
    expectEvent(ret, "BTokensSold", {
      seller: aliceAccount,
      bTokensSold: "5000",
      collateralPaid: "893", // collateral closed out is 1020 minus the fee of 127
    })

    // Verify fees got sent
    assertBNEq(
      await underlyingToken.balanceOf(feeDestination),
      feesCollected,
      "Fees should have been collected in address",
    )
  })
})
