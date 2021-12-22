/* global artifacts contract it assert */
import {
  time,
  expectEvent,
  expectRevert,
  BN,
  constants,
} from "@openzeppelin/test-helpers"
import { contract, assert } from "hardhat"
import {
  SeriesControllerInstance,
  SeriesControllerContract,
  ERC1155ControllerInstance,
  SeriesVaultInstance,
  SimpleTokenInstance,
} from "../../typechain"

const SeriesController: SeriesControllerContract =
  artifacts.require("SeriesController")

let deployedSeriesController: SeriesControllerInstance
let deployedVault: SeriesVaultInstance
let deployedERC1155Controller: ERC1155ControllerInstance

let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance
let collateralToken: SimpleTokenInstance

let expiration: number
let strikePrice: string
let isPutOption: boolean
let exerciseFee: number
let closeFee: number
let claimFee: number
let seriesId: string

import {
  getSeriesName,
  assertBNEq,
  setupSingletonTestContracts,
  setupAllTestContracts,
} from "../util"

const STATE_OPEN = 0
const STATE_EXPIRED = 1

const ERROR_MESSAGES = {
  CANNOT_EXERCISE_EXPIRED: "Option contract must be in Open State to exercise",
  CANNOT_EXERCISE_PRIOR_EXERCISE_WINDOW: "!Expired",
  CANNOT_CLAIM_OPEN: "!Expired",
  CANNOT_CLOSE_EXPIRED: "!Open",
  CANNOT_MINT_NOT_OPEN: "!Open",
  NOT_ENOUGH_BALANCE: "ERC20: transfer amount exceeds balance",
  NOT_APPROVED_BALANCE: "ERC20: transfer amount exceeds allowance",
  NON_MINTER: "mintOptions: only restrictedMinter can mint",
}

contract("Proxy Series Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const carolAccount = accounts[3]
  const ONE_DAY = 60 * 60 * 24

  const defaultRestrictedMinters = [aliceAccount, bobAccount]

  beforeEach(async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      deployedVault,
      deployedERC1155Controller,
      expiration,
      seriesId,
      strikePrice,
      isPutOption,
      exerciseFee,
      closeFee,
      claimFee,
    } = await setupAllTestContracts())
  })

  it("Cannot initialize twice", async () => {
    const {
      deployedSeriesController,
      deployedPriceOracle,
      deployedVault,
      deployedERC1155Controller,
      exerciseFee,
      closeFee,
      claimFee,
    } = await setupAllTestContracts()

    // cannot initialize twice
    await expectRevert(
      deployedSeriesController.__SeriesController_init(
        deployedPriceOracle.address,
        deployedVault.address,
        deployedERC1155Controller.address,
        {
          feeReceiver: "0x000000000000000000000000000000000000dead",
          exerciseFeeBasisPoints: exerciseFee,
          closeFeeBasisPoints: closeFee,
          claimFeeBasisPoints: claimFee,
        },
      ),
      "Initializable: contract is already initialized",
    )
  })

  it("Creates Series", async () => {
    const seriesName = await getSeriesName(
      underlyingToken,
      priceToken,
      collateralToken,
      parseInt(strikePrice),
      expiration,
      isPutOption,
    )

    assert.equal(seriesId, "0")

    assert.equal(
      await deployedSeriesController.seriesName(seriesId),
      seriesName,
      "Name should be set correctly",
    )

    assert.equal(
      await deployedSeriesController.underlyingToken(seriesId),
      underlyingToken.address,
      "underlyingToken should be set correctly",
    )
    assert.equal(
      await deployedSeriesController.collateralToken(seriesId),
      collateralToken.address,
      "collateralToken should be set correctly",
    )

    assert.equal(
      await deployedSeriesController.priceToken(seriesId),
      priceToken.address,
      "priceToken should be set correctly",
    )

    assertBNEq(
      await deployedSeriesController.strikePrice(seriesId),
      strikePrice,
      "strikePrice should be set correctly",
    )
    assertBNEq(
      await deployedSeriesController.expirationDate(seriesId),
      expiration,
      "EXPIRATION should be set correctly",
    )
    assertBNEq(
      await deployedSeriesController.state(seriesId),
      STATE_OPEN,
      "STATE should be set correctly",
    )

    // Fees
    assertBNEq(
      await deployedSeriesController.exerciseFeeBasisPoints(seriesId),
      exerciseFee,
      "EXERCISE_FEE should be set correctly",
    )
    assertBNEq(
      await deployedSeriesController.closeFeeBasisPoints(seriesId),
      closeFee,
      "CLOSE_FEE should be set correctly",
    )
    assertBNEq(
      await deployedSeriesController.claimFeeBasisPoints(seriesId),
      claimFee,
      "CLAIM_FEE should be set correctly",
    )

    // Owner should be set
    const defaultAdminRole = await deployedSeriesController.DEFAULT_ADMIN_ROLE()

    assert.strictEqual(
      await deployedSeriesController.hasRole(defaultAdminRole, ownerAccount),
      true,
      "default admin role should be set",
    )

    assert(
      await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        aliceAccount,
      ),
    )
    assert(
      await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        bobAccount,
      ),
    )
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        ownerAccount,
      )),
    )
  })

  it("Creates multiple Series", async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      expiration,
      exerciseFee,
      closeFee,
      claimFee,
    } = await setupSingletonTestContracts())

    const additionalStrikePrice = 15_000e8

    const seriesName = await getSeriesName(
      underlyingToken,
      priceToken,
      collateralToken,
      additionalStrikePrice,
      expiration,
      isPutOption,
    )

    // Verify the strike is allowed
    await deployedSeriesController.updateAllowedTokenStrikeRanges(
      underlyingToken.address,
      new BN(strikePrice).sub(new BN(1)),
      new BN(additionalStrikePrice).add(new BN(1)),
      1,
    )

    const resp = await deployedSeriesController.createSeries(
      {
        underlyingToken: underlyingToken.address,
        priceToken: priceToken.address,
        collateralToken: collateralToken.address,
      },
      [strikePrice, additionalStrikePrice],
      [expiration, expiration],
      defaultRestrictedMinters,
      isPutOption,
    )

    // @ts-ignore
    seriesId = resp.logs[2].args.seriesId
    assert.equal(seriesId, "0")

    // @ts-ignore
    seriesId = resp.logs[3].args.seriesId

    assert.equal(seriesId, "1")

    assert.equal(
      await deployedSeriesController.seriesName(seriesId),
      seriesName,
      "Name should be set correctly",
    )

    assert.equal(
      await deployedSeriesController.underlyingToken(seriesId),
      underlyingToken.address,
      "underlyingToken should be set correctly",
    )
    assert.equal(
      await deployedSeriesController.collateralToken(seriesId),
      collateralToken.address,
      "collateralToken should be set correctly",
    )

    assert.equal(
      await deployedSeriesController.priceToken(seriesId),
      priceToken.address,
      "priceToken should be set correctly",
    )

    assertBNEq(
      await deployedSeriesController.strikePrice(seriesId),
      additionalStrikePrice,
      "strikePrice should be set correctly",
    )
    assertBNEq(
      await deployedSeriesController.expirationDate(seriesId),
      expiration,
      "EXPIRATION should be set correctly",
    )
    assertBNEq(
      await deployedSeriesController.state(seriesId),
      STATE_OPEN,
      "STATE should be set correctly",
    )

    // Fees
    assertBNEq(
      await deployedSeriesController.exerciseFeeBasisPoints(seriesId),
      exerciseFee,
      "EXERCISE_FEE should be set correctly",
    )
    assertBNEq(
      await deployedSeriesController.closeFeeBasisPoints(seriesId),
      closeFee,
      "CLOSE_FEE should be set correctly",
    )
    assertBNEq(
      await deployedSeriesController.claimFeeBasisPoints(seriesId),
      claimFee,
      "CLAIM_FEE should be set correctly",
    )

    // Owner should be set
    const defaultAdminRole = await deployedSeriesController.DEFAULT_ADMIN_ROLE()

    assert.strictEqual(
      await deployedSeriesController.hasRole(defaultAdminRole, ownerAccount),
      true,
      "default admin role should be set",
    )

    assert(
      await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        aliceAccount,
      ),
    )
    assert(
      await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        bobAccount,
      ),
    )
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        ownerAccount,
      )),
    )

    // verify events
    expectEvent(resp, "SeriesCreated", {
      seriesId: "0",
      tokens: [
        underlyingToken.address,
        priceToken.address,
        collateralToken.address,
      ],
      restrictedMinters: defaultRestrictedMinters,
      strikePrice: strikePrice,
      expirationDate: expiration.toString(),
      isPutOption,
    })

    // OZ's test helper utils are kind of stupid and we need to manually check the values here
    expectEvent(resp, "SeriesCreated", {
      seriesId,
      tokens: [
        underlyingToken.address,
        priceToken.address,
        collateralToken.address,
      ],
      restrictedMinters: defaultRestrictedMinters,
      strikePrice: additionalStrikePrice.toString(),
      expirationDate: expiration.toString(),
      isPutOption,
    })
  })

  it("fails to initialise Series with any tokens equal to the 0x0 address", async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      expiration,
      exerciseFee,
      closeFee,
      claimFee,
    } = await setupSingletonTestContracts())

    await expectRevert(
      deployedSeriesController.createSeries(
        {
          underlyingToken: constants.ZERO_ADDRESS,
          priceToken: priceToken.address,
          collateralToken: collateralToken.address,
        },
        [strikePrice],
        [expiration],
        [],
        isPutOption,
      ),
      "!Underlying",
    )

    await expectRevert(
      deployedSeriesController.createSeries(
        {
          underlyingToken: priceToken.address,
          priceToken: constants.ZERO_ADDRESS,
          collateralToken: collateralToken.address,
        },
        [strikePrice],
        [expiration],
        [],
        isPutOption,
      ),
      "!Price",
    )

    await expectRevert(
      deployedSeriesController.createSeries(
        {
          underlyingToken: priceToken.address,
          priceToken: collateralToken.address,
          collateralToken: constants.ZERO_ADDRESS,
        },
        [strikePrice],
        [expiration],
        [],
        isPutOption,
      ),
      "!Collateral",
    )
  })

  it("fails to initialise Series with empty restrictedMinters arg", async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      expiration,
      exerciseFee,
      closeFee,
      claimFee,
    } = await setupSingletonTestContracts())

    await expectRevert(
      deployedSeriesController.createSeries(
        {
          underlyingToken: underlyingToken.address,
          priceToken: priceToken.address,
          collateralToken: collateralToken.address,
        },
        [strikePrice],
        [expiration],
        [],
        isPutOption,
      ),
      "!restrictedMinters",
    )
  })

  it("Calculates open and expired state", async () => {
    // No time has passed so should be open
    assertBNEq(
      await deployedSeriesController.state(seriesId),
      STATE_OPEN,
      "STATE should be open",
    )

    // Move the block time into the future
    await time.increaseTo(expiration + ONE_DAY)

    // Should now be expired
    assertBNEq(
      await deployedSeriesController.state(seriesId),
      STATE_EXPIRED,
      "STATE should be expired after moving time",
    )
  })

  it("Mints option wTokens and bTokens", async () => {
    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // It should fail to mint options before alice has approved the tokens to be transferred
    await expectRevert.unspecified(
      deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
        from: aliceAccount,
      }),
    )

    // approve the amount
    await collateralToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    // It should fail to mint more than Alice owns
    await expectRevert.unspecified(
      deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT + 1, {
        from: aliceAccount,
      }),
    )

    // It should fail to mint for a seriesId which doesn't exist
    await expectRevert(
      deployedSeriesController.mintOptions(1337, MINT_AMOUNT, {
        from: aliceAccount,
      }),
      "!_seriesId",
    )

    // It should fail to mint when minter is not one of the restricted minters
    await expectRevert(
      deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT),
      "!Minter",
    )

    // It should succeed
    const ret = await deployedSeriesController.mintOptions(
      seriesId,
      MINT_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    // Verify the event
    expectEvent(ret, "OptionMinted", {
      minter: aliceAccount,
      seriesId,
      optionTokenAmount: MINT_AMOUNT.toString(),
      wTokenTotalSupply: (
        await deployedERC1155Controller.optionTokenTotalSupply(wTokenIndex)
      ).toString(),
      bTokenTotalSupply: (
        await deployedERC1155Controller.optionTokenTotalSupply(bTokenIndex)
      ).toString(),
    })

    // Verify alice has 100 wTokens and 100 bTokens
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, wTokenIndex),
      MINT_AMOUNT,
      "wToken MINT_AMOUNT should be set correctly",
    )
    assertBNEq(
      await await deployedERC1155Controller.balanceOf(
        aliceAccount,
        bTokenIndex,
      ),
      MINT_AMOUNT,
      "bToken MINT_AMOUNT should be set correctly",
    )
  })

  it("allows exercise if expired", async () => {
    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // approve the amount
    await collateralToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    // It should succeed to mint bTokens
    await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
      from: aliceAccount,
    })

    // Move the block time into the future
    await time.increaseTo(expiration + ONE_DAY)

    // Approve controller to burn tokens
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: aliceAccount },
    )

    await deployedSeriesController.exerciseOption(seriesId, MINT_AMOUNT, true, {
      from: aliceAccount,
    })
  })

  it("Blocks redeem if prior to start of the exercise window", async () => {
    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // approve the amount
    await collateralToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    // It should succeed to mint bTokens
    await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
      from: aliceAccount,
    })

    const SECONDS_TO_EXPIRY = 10 // 10 seconds prior to the exercise window begins
    await time.increaseTo(expiration - ONE_DAY - SECONDS_TO_EXPIRY)

    // It should fail to redeem since current time is still prior to the
    // start of the exercise window
    await expectRevert(
      deployedSeriesController.exerciseOption(seriesId, MINT_AMOUNT, true, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.CANNOT_EXERCISE_PRIOR_EXERCISE_WINDOW,
    )
  })

  it("Allows exercise for European-style option", async () => {
    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 collateral tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // approve the amount and mint alice some options
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

    // Move the block time into the future during the exercise window but before expiration
    await time.increaseTo(expiration + ONE_DAY)

    // send bTokens to bob (as if bob bought the bTokens)
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    await deployedERC1155Controller.safeTransferFrom(
      aliceAccount,
      bobAccount,
      bTokenIndex,
      MINT_AMOUNT,
      "0x0",
      { from: aliceAccount },
    )

    // Approve controller to burn tokens
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: bobAccount },
    )

    const ret = await deployedSeriesController.exerciseOption(
      seriesId,
      MINT_AMOUNT,
      true,
      {
        from: bobAccount,
      },
    )

    // exercised event should have been called
    expectEvent(ret, "OptionExercised", {
      redeemer: bobAccount,
      seriesId,
      optionTokenAmount: MINT_AMOUNT.toString(),
      // 100 * (12_000 - 10_000) / 12_000 = 16.666
      collateralAmount: "17",
    })

    // All of Bob's bTokens should be gone
    assertBNEq(
      await deployedERC1155Controller.balanceOf(bobAccount, bTokenIndex),
      0,
      "bToken should be redeemed",
    )
  })

  it("Allows claiming after expiration with no redemptions", async () => {
    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Save off the wToken
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

    // approve the amount and mint alice some options
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

    // Alice should fail to claim since the contract is still open
    await expectRevert(
      deployedSeriesController.claimCollateral(seriesId, MINT_AMOUNT, {
        from: aliceAccount,
      }),
      ERROR_MESSAGES.CANNOT_CLAIM_OPEN,
    )

    // Move the block time into the future so the contract is expired
    await time.increaseTo(expiration + ONE_DAY)

    // Give Carol some tokens
    await collateralToken.mint(carolAccount, MINT_AMOUNT)

    // Carol should not be able to mint new options now that it is not open
    await collateralToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: carolAccount,
      },
    )
    await expectRevert(
      deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
        from: carolAccount,
      }),
      ERROR_MESSAGES.CANNOT_MINT_NOT_OPEN,
    )

    // Bob should fail to claim collateral since he doesn't have any tokens
    await expectRevert.unspecified(
      deployedSeriesController.claimCollateral(seriesId, MINT_AMOUNT, {
        from: bobAccount,
      }),
    )

    // Approve controller to burn tokens
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: aliceAccount },
    )

    // Should succeed from Alice
    const ret = await deployedSeriesController.claimCollateral(
      seriesId,
      MINT_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    // Claim event should have been called
    expectEvent(ret, "CollateralClaimed", {
      redeemer: aliceAccount,
      seriesId,
      optionTokenAmount: MINT_AMOUNT.toString(),
      // 100 - (100* (12_000 - 10_000) / 12_000) = 100 - 16.666 ~= 83
      collateralAmount: "83",
    })

    // All of Alices's wTokens should be gone
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, wTokenIndex),
      0,
      "wToken should be claimed",
    )
  })

  it("Allows claiming after expiration with full redemptions", async () => {
    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Save off the tokens
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    // approve the amount and mint alice some options - wBTC collateral will be locked into series contract
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

    // Send the bTokens from alice to Bob - simulates alice selling option
    await deployedERC1155Controller.safeTransferFrom(
      aliceAccount,
      bobAccount,
      bTokenIndex,
      MINT_AMOUNT,
      "0x0",
      { from: aliceAccount },
    )

    // Move the block time into the future so the contract is expired
    await time.increaseTo(expiration + ONE_DAY)

    // Bob exercises
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: bobAccount },
    )
    await deployedSeriesController.exerciseOption(seriesId, MINT_AMOUNT, true, {
      from: bobAccount,
    })

    // Should succeed from Alice claiming leftover collateral
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: aliceAccount },
    )
    await deployedSeriesController.claimCollateral(seriesId, MINT_AMOUNT, {
      from: aliceAccount,
    })

    // Bob should own his share of collateral tokens
    assertBNEq(
      await collateralToken.balanceOf(bobAccount),
      "17",
      "bob should have his collateral",
    )

    // Alice should own her share of collateral tokens
    assertBNEq(
      await collateralToken.balanceOf(aliceAccount),
      "83",
      "alice should have her collateral",
    )
  })

  it("Allows claiming after expiration with partial redemptions", async () => {
    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Save off the tokens
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

    // approve the amount and mint alice some options
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

    // Send the bTokens from alice to Bob
    await deployedERC1155Controller.safeTransferFrom(
      aliceAccount,
      bobAccount,
      bTokenIndex,
      MINT_AMOUNT,
      "0x0",
      { from: aliceAccount },
    )

    // Move the block time into the future so the contract is expired
    await time.increaseTo(expiration + ONE_DAY)

    // Only redeem half
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: bobAccount },
    )
    await deployedSeriesController.exerciseOption(
      seriesId,
      MINT_AMOUNT / 2,
      true,
      { from: bobAccount },
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

    // Bob should own half of his share of collateral tokens
    assertBNEq(
      await collateralToken.balanceOf(bobAccount),
      "9",
      "bob should have his collateral",
    )

    // Alice should own her full share of collateral tokens
    assertBNEq(
      await collateralToken.balanceOf(aliceAccount),
      "83",
      "alice should have her collateral",
    )

    // the Series should own residual collateral tokens
    assertBNEq(
      await collateralToken.balanceOf(deployedVault.address),
      "8",
      "the series should have its collateral",
    )
  })

  it("Allows closing a position while open", async () => {
    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice and bob 100 tokens each
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)
    await collateralToken.mint(bobAccount, MINT_AMOUNT)

    // Save off the tokens
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)

    // approve the amount and mint alice some options for both alice and bob
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

    await collateralToken.approve(
      deployedSeriesController.address,
      MINT_AMOUNT,
      {
        from: bobAccount,
      },
    )
    await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
      from: bobAccount,
    })

    // Allow Alice to close her position
    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: aliceAccount },
    )
    const ret = await deployedSeriesController.closePosition(
      seriesId,
      MINT_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    // Close event should have been called
    expectEvent(ret, "OptionClosed", {
      redeemer: aliceAccount,
      seriesId,
      optionTokenAmount: new BN(MINT_AMOUNT),
    })

    // Move the block time into the future so the contract is expired
    await time.increaseTo(expiration + ONE_DAY)

    // Bob should fail to close after expiration date
    await expectRevert(
      deployedSeriesController.closePosition(seriesId, MINT_AMOUNT, {
        from: bobAccount,
      }),
      ERROR_MESSAGES.CANNOT_CLOSE_EXPIRED,
    )

    // wToken and bToken should be burned
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, wTokenIndex),
      0,
      "wToken should be burned",
    )
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      0,
      "bToken should be burned",
    )

    // Alice should have her original collateral back
    assertBNEq(
      await collateralToken.balanceOf(aliceAccount),
      MINT_AMOUNT,
      "alice should end up with collateral after closing",
    )
  })

  it("should upgrade correctly", async () => {
    const newImpl = await SeriesController.new()

    // should fail to upgrade if not admin
    await expectRevert(
      deployedSeriesController.updateImplementation(newImpl.address, {
        from: aliceAccount,
      }),
      "!admin",
    )

    // now make sure it changes when we update the implementation

    const existingImplAddress = await deployedSeriesController.getLogicAddress()

    await deployedSeriesController.updateImplementation(newImpl.address)

    const newImplAddress = await deployedSeriesController.getLogicAddress()

    assert(existingImplAddress !== newImplAddress)
    assert(
      newImplAddress === (await deployedSeriesController.getLogicAddress()),
    )
  })

  it("should pause and unpause correctly", async () => {
    await deployedSeriesController.pause()

    assert(await deployedSeriesController.paused())

    // now unpause

    await deployedSeriesController.unpause()

    assert(!(await deployedSeriesController.paused()))
  })

  it("should transfer ownership correctly", async () => {
    // the deployer (owner) account should have pauser and admin role
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        ownerAccount,
      )),
    )
    assert(
      await deployedSeriesController.hasRole(
        await deployedSeriesController.PAUSER_ROLE(),
        ownerAccount,
      ),
    )
    assert(
      await deployedSeriesController.hasRole(
        await deployedSeriesController.DEFAULT_ADMIN_ROLE(),
        ownerAccount,
      ),
    )

    // and alice should have no roles
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        carolAccount,
      )),
    )
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.PAUSER_ROLE(),
        carolAccount,
      )),
    )
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.DEFAULT_ADMIN_ROLE(),
        carolAccount,
      )),
    )

    await deployedSeriesController.transferOwnership(carolAccount)

    // now the roles should be switched
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        ownerAccount,
      )),
    )
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.PAUSER_ROLE(),
        ownerAccount,
      )),
    )
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.DEFAULT_ADMIN_ROLE(),
        ownerAccount,
      )),
    )

    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        carolAccount,
      )),
    )
    assert(
      await deployedSeriesController.hasRole(
        await deployedSeriesController.PAUSER_ROLE(),
        carolAccount,
      ),
    )
    assert(
      await deployedSeriesController.hasRole(
        await deployedSeriesController.DEFAULT_ADMIN_ROLE(),
        carolAccount,
      ),
    )

    // now transfer it back
    await deployedSeriesController.transferOwnership(ownerAccount, {
      from: carolAccount,
    })

    // check to make sure it's back to the original state prior to any of the transfers
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        ownerAccount,
      )),
    )
    assert(
      await deployedSeriesController.hasRole(
        await deployedSeriesController.PAUSER_ROLE(),
        ownerAccount,
      ),
    )
    assert(
      await deployedSeriesController.hasRole(
        await deployedSeriesController.DEFAULT_ADMIN_ROLE(),
        ownerAccount,
      ),
    )

    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.MINTER_ROLE(),
        carolAccount,
      )),
    )
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.PAUSER_ROLE(),
        carolAccount,
      )),
    )
    assert(
      !(await deployedSeriesController.hasRole(
        await deployedSeriesController.DEFAULT_ADMIN_ROLE(),
        carolAccount,
      )),
    )
  })
})
