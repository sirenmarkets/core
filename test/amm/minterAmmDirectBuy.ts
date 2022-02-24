import { expectEvent, expectRevert, time, BN } from "@openzeppelin/test-helpers"
import { contract, assert } from "hardhat"
import {
  ERC1155ControllerInstance,
  SeriesControllerInstance,
  MinterAmmInstance,
  MinterAmmContract,
  SimpleTokenInstance,
  LightInstance,
  AddressesProviderInstance,
} from "../../typechain"
import { createSignedOrder } from "../airswap/helper"
import helpers from "../testHelpers"
const { ethers } = require("hardhat")

import { setupAllTestContracts, ONE_WEEK_DURATION, assertBNEq } from "../util"

const MinterAmmFeeBased: MinterAmmContract = artifacts.require("MinterAmm")

const ERROR_MESSAGES = {
  B_TOKEN_BUY_SLIPPAGE: "Slippage exceeded",
  B_TOKEN_SELL_SLIPPAGE: "Slippage exceeded",
  UNAUTHORIZED: "!manager",
}

let deployedERC1155Controller: ERC1155ControllerInstance
let deployedSeriesController: SeriesControllerInstance
let expiration: number
let seriesId: string
let underlyingToken: SimpleTokenInstance
let deployedLightAirswap: LightInstance
let deployedAddressesProvider: AddressesProviderInstance

/**
 * Testing MinterAmm volatility factor updates
 */
contract("AMM Direct Buy", (accounts) => {
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
      deployedLightAirswap,
      deployedAddressesProvider,
    } = await setupAllTestContracts({}))

    await deployedAddressesProvider.setDirectBuyManager(ownerAccount)
  })

  it("Checks restrictions on direct buy", async () => {
    const aliceAccount = accounts[1]
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000e8)
    await underlyingToken.approve(deployedAmm.address, 10000e8)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000e8, 0)

    // Verify non owner cannot call
    await expectRevert(
      deployedAmm.bTokenDirectBuy(
        1,
        0,
        expiration,
        aliceAccount,
        100,
        2000,
        27,
        helpers.ZERO_BYTES32,
        helpers.ZERO_BYTES32,
        {
          from: accounts[5],
        },
      ),
      ERROR_MESSAGES.UNAUTHORIZED,
    )

    // Verify series is open
    await expectRevert(
      deployedAmm.bTokenDirectBuy(
        1,
        0,
        expiration,
        aliceAccount,
        100,
        2000,
        27,
        helpers.ZERO_BYTES32,
        helpers.ZERO_BYTES32,
      ),
      "E13",
    )

    // Verify lightswap is set
    await deployedAddressesProvider.setAirswapLight(helpers.ADDRESS_ZERO)

    await expectRevert(
      deployedAmm.bTokenDirectBuy(
        seriesId,
        0,
        expiration,
        aliceAccount,
        100,
        2000,
        27,
        helpers.ZERO_BYTES32,
        helpers.ZERO_BYTES32,
      ),
      "E16",
    )
  })

  it("Check the scenario with not enough collateral to mint bTokens", async () => {
    const aliceAccount = accounts[1]
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000e8)
    await underlyingToken.approve(deployedAmm.address, 10000e8)

    // Provide capital - just a small amt
    await deployedAmm.provideCapital(1000, 0)

    // Verify fails to mint
    await expectRevert(
      deployedAmm.bTokenDirectBuy(
        seriesId,
        0,
        expiration,
        aliceAccount,
        100,
        2000,
        27,
        helpers.ZERO_BYTES32,
        helpers.ZERO_BYTES32,
      ),
      "ERC20: transfer amount exceeds balance",
    )
  })

  it("Check the success scenario", async () => {
    let alice
    let sender
    let signer
    let anyone
    ;[sender, signer, alice, anyone] = await ethers.getSigners()

    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000e8)
    await underlyingToken.approve(deployedAmm.address, 10000e8)

    // Provide capital - just a small amt
    await deployedAmm.provideCapital(10000e8, 0)

    // Approve payment tokens from Alice to the Light contract
    const signerAmount = 1000e8
    const senderAmount = 100
    await underlyingToken.mint(signer.address, signerAmount)
    await underlyingToken.approve(deployedLightAirswap.address, signerAmount, {
      from: signer.address,
    })

    // Get the token index from the series ID
    const tokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    // Have Alice sign the payload
    const order = await createSignedOrder(
      {
        signerTokenAddress: underlyingToken.address,
        signerAmount: signerAmount,
        senderAddress: deployedAmm.address,
        senderTokenAddress: deployedERC1155Controller.address,
        tokenIndex: tokenIndex.toString(),
        senderAmount,
        lightAddress: deployedLightAirswap.address,
        expiry: expiration,
      },
      signer,
    )

    // Submit the direct buy from owner acct
    const ret = await deployedAmm.bTokenDirectBuy(
      seriesId,
      order.nonce,
      order.expiry,
      order.signerWallet,
      order.signerAmount,
      order.senderAmount,
      order.v,
      order.r,
      order.s,
    )

    // Verify the AMM got the collateral - should be original collateral + signerAmount - amount used to mint bTokens (senderAmount)
    assertBNEq(
      await underlyingToken.balanceOf(deployedAmm.address),
      10000e8 + signerAmount - senderAmount,
      "AMM should get paid",
    )

    // Verify Alice got the options
    assertBNEq(
      await deployedERC1155Controller.balanceOf(order.signerWallet, tokenIndex),
      senderAmount,
      "Trader should receive purchased bTokens",
    )

    // Verify Events
    expectEvent(ret, "BTokensBought", {
      buyer: order.signerWallet,
      seriesId,
      bTokensBought: new BN(senderAmount),
      collateralPaid: new BN(signerAmount),
    })
  })

  it("Check the success scenario with fees", async () => {
    let alice
    let sender
    let signer
    let anyone
    ;[sender, signer, alice, anyone] = await ethers.getSigners()

    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000e8)
    await underlyingToken.approve(deployedAmm.address, 10000e8)

    // Provide capital - just a small amt
    await deployedAmm.provideCapital(10000e8, 0)

    // Update Fees
    await deployedAmm.setTradingFeeParams(
      new BN(3),
      new BN(1250),
      accounts[5],
      {
        from: ownerAccount,
      },
    )

    // Approve payment tokens from Alice to the Light contract
    const signerAmount = 1000e8
    const senderAmount = 100000
    await underlyingToken.mint(signer.address, signerAmount)
    await underlyingToken.approve(deployedLightAirswap.address, signerAmount, {
      from: signer.address,
    })

    // Get the token index from the series ID
    const tokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    // Have Alice sign the payload
    const order = await createSignedOrder(
      {
        signerTokenAddress: underlyingToken.address,
        signerAmount: signerAmount,
        senderAddress: deployedAmm.address,
        senderTokenAddress: deployedERC1155Controller.address,
        tokenIndex: tokenIndex.toString(),
        senderAmount,
        lightAddress: deployedLightAirswap.address,
        expiry: expiration,
      },
      signer,
    )

    // Submit the direct buy from owner acct
    const ret = await deployedAmm.bTokenDirectBuy(
      seriesId,
      order.nonce,
      order.expiry,
      order.signerWallet,
      order.signerAmount,
      order.senderAmount,
      order.v,
      order.r,
      order.s,
    )

    const expectedFees = 30

    // Verify the AMM got the collateral - should be original collateral + signerAmount - amount used to mint bTokens (senderAmount) - fees
    assertBNEq(
      await underlyingToken.balanceOf(deployedAmm.address),
      10000e8 + signerAmount - senderAmount - expectedFees,
      "AMM should get paid",
    )

    // Verify fees got sent
    assertBNEq(
      await underlyingToken.balanceOf(accounts[5]),
      expectedFees,
      "Fees should be sent",
    )

    // Verify Alice got the options
    assertBNEq(
      await deployedERC1155Controller.balanceOf(order.signerWallet, tokenIndex),
      senderAmount,
      "Trader should receive purchased bTokens",
    )

    // Verify Events
    expectEvent(ret, "BTokensBought", {
      buyer: order.signerWallet,
      seriesId,
      bTokensBought: new BN(senderAmount),
      collateralPaid: new BN(signerAmount),
    })
  })
})
