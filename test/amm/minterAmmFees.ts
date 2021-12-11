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
      expiration,
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
    await underlyingToken.mint(aliceAccount, 100e8)
    await underlyingToken.approve(deployedAmm.address, 100e8, {
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
    ret = await deployedAmm.bTokenBuy(seriesId, 100e8, 100e8, {
      from: aliceAccount,
    })

    // Check fees - fee on 100e8 of bTokens should be 0.03% (3 basis points) => 0.03e8
    // Max fee should be 12.5% of amount of collateral required which is 17.83e8 * 12.5% => 2.23e8
    expectEvent(ret, "TradeFeesPaid", {
      feePaidTo: feeDestination,
      feeAmount: "3000000", // the fee of 3 is less than 254 so lower fee is used
    })
    feesCollected += 0.03e8

    // Formula: 1/2 * (sqrt((Rr + Rc - Δr)^2 + 4 * Δr * Rc) + Δr - Rr - Rc) - fee
    expectEvent(ret, "BTokensBought", {
      buyer: aliceAccount,
      bTokensBought: "10000000000",
      collateralPaid: "1786174455", // 17.83e8 to pay for option and 0.03e8 for fee => 17.86e8
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
    ret = await deployedAmm.bTokenBuy(seriesId, 100e8, 100e8, {
      from: aliceAccount,
    })

    // Check fees - fee on 100e8 of bTokens should be 10% (1000 basis points) => 10e8
    // Max fee should be 12.5% of amount of collateral required which is 17.83e8 * 12.5% => 2.23e8
    expectEvent(ret, "TradeFeesPaid", {
      feePaidTo: feeDestination,
      feeAmount: "222909312", // the fee of 2.23e8 is less than 10e8 so lower fee is used
    })
    feesCollected += 222909312

    // Check the amount bought
    expectEvent(ret, "BTokensBought", {
      buyer: aliceAccount,
      bTokensBought: "10000000000",
      collateralPaid: "2006183809", // 17.83e8 to pay for option and 2.23e8 for fee => 20.06e8
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
    ret = await deployedAmm.bTokenSell(seriesId, 50e8, 0, {
      from: aliceAccount,
    })

    // Verify fee events - collateral sent to user will be minus fee
    // Check fees - fee on 50e8 of bTokens should be 0.03% (3 basis points) => 0.015e8
    // Max fee should be 12.5% of amount of collateral required which is 8.86e8 * 12.5% => 1.10e8
    expectEvent(ret, "TradeFeesPaid", {
      feePaidTo: feeDestination,
      feeAmount: "1500000", // the fee of 0.015e8 is less than 1.10e8 so lower fee is used
    })
    feesCollected += 1500000

    // Check the amount bought
    expectEvent(ret, "BTokensSold", {
      seller: aliceAccount,
      bTokensSold: "5000000000",
      collateralPaid: "881018045", // collateral closed out is 8.82e8 minus the fee of 0.015e8
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
    ret = await deployedAmm.bTokenSell(seriesId, 50e8, 0, {
      from: aliceAccount,
    })

    // Verify fee events - collateral sent to user will be minus fee
    // Check fees - fee on 50e8 of bTokens should be 50% (5000 basis points) => 25e8
    // Max fee should be 12.5% of amount of collateral required which is 8.82e8 * 12.5% => 1.10e8
    expectEvent(ret, "TradeFeesPaid", {
      feePaidTo: feeDestination,
      feeAmount: "110316328", // the fee of 1.10e8 is less than 25e8 so lower fee is used
    })
    feesCollected += 110316328

    // Check the amount bought
    expectEvent(ret, "BTokensSold", {
      seller: aliceAccount,
      bTokensSold: "5000000000",
      collateralPaid: "772214303", // collateral closed out is 8.82e8 minus the fee of 1.10e8
    })

    // Verify fees got sent
    assertBNEq(
      await underlyingToken.balanceOf(feeDestination),
      feesCollected,
      "Fees should have been collected in address",
    )
  })
})
