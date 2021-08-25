/* global artifacts contract it assert */
import { time, expectEvent, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract } from "hardhat"
import {
  MockPriceOracleInstance,
  PriceOracleInstance,
  SimpleTokenInstance,
  MinterAmmInstance,
  SeriesControllerInstance,
  SimpleTokenContract,
  ERC1155ControllerInstance,
} from "../../typechain"

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

import {
  setupAllTestContracts,
  setupSeries,
  checkBalances,
  assertBNEq,
  ONE_WEEK_DURATION,
} from "../util"

let deployedSeriesController: SeriesControllerInstance
let deployedERC1155Controller: ERC1155ControllerInstance
let deployedAmm: MinterAmmInstance
let deployedMockPriceOracle: MockPriceOracleInstance
let deployedPriceOracle: PriceOracleInstance

let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance
let collateralToken: SimpleTokenInstance

let expiration: number
let seriesId: string

const STRIKE_PRICE = (20000e8).toString() // 20000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

const STATE_EXPIRED = 1

const ONE_DAY = 60 * 60 * 24

/**
 * Testing the flows for expired Series contracts
 */
contract("Minter AMM Expired", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  beforeEach(async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedAmm,
      seriesId,
      deployedSeriesController,
      deployedERC1155Controller,
      deployedPriceOracle,
      deployedMockPriceOracle,
      expiration,
    } = await setupAllTestContracts({
      oraclePrice: BTC_ORACLE_PRICE,
      strikePrice: STRIKE_PRICE,
    }))
  })

  it("Expired OTM with constant price", async () => {
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    const initialCapital = 10000
    // Approve collateral
    await collateralToken.mint(ownerAccount, initialCapital)
    await collateralToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    let receipt = await deployedAmm.provideCapital(initialCapital, 0)

    // Now let's do some trading from another account
    await collateralToken.mint(aliceAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toString(),
      initialCapital.toString(),
      "Total assets value in the AMM should be 10k",
    )

    // Check that AMM calculates correct bToken price
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called
    assertBNEq(
      (await deployedAmm.getPriceForSeries(seriesId)).toString(),
      "21756000000000000", // 0.0217 * 1e18
      "AMM should calculate bToken price correctly",
    )

    // Buy bTokens
    receipt = await deployedAmm.bTokenBuy(seriesId, 3000, 3000, {
      from: aliceAccount,
    })

    // Check Alice balances
    // Alice paid 91 for 3000 tokens at ~0.0217 + slippage
    await checkBalances(
      deployedERC1155Controller,
      aliceAccount,
      "Alice",
      collateralToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      909,
      3000,
      0,
      0,
    )

    // // Check AMM balances
    await checkBalances(
      deployedERC1155Controller,
      deployedAmm.address,
      "AMM",
      collateralToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      7091,
      0,
      3000,
      0,
    )

    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toString(),
      (10025).toString(), // ~7091 + 3000 * (1 - 0.0217) (btw, 10025 > 10000 - LPs are making money!!!)
      "Total assets value in the AMM should be correct",
    )

    // Move the block time into the future so the contract is expired
    await time.increaseTo(expiration)

    // Make sure series is expired
    assertBNEq(
      await deployedSeriesController.state(seriesId),
      STATE_EXPIRED.toString(),
      "Series should expire",
    )

    // now that we advanced forward to the expiration date, we can set the Series' matching
    // settlement price on the PriceOracle
    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    // Check that getOptionTokensSaleValue is 0 since there's no active tokens in the pool
    const tokensSaleValue = await deployedAmm.getOptionTokensSaleValue(993)
    assertBNEq(tokensSaleValue.toString(), "0", "tokensSaleValue should be 0")

    // Check unclaimed balances
    const unredeemedCollateral =
      await deployedAmm.getCollateralValueOfAllExpiredOptionTokens()
    assertBNEq(
      unredeemedCollateral.toString(),
      (3000).toString(),
      "unredeemedCollateral should be correct",
    )

    // We should be able to withdraw from the closed API
    // We provided 100k in lp tokens, see if we can get it all back in 2 batches
    receipt = await deployedAmm.withdrawCapital(initialCapital / 2, true, 5045)

    expectEvent(receipt, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "5045",
      lpTokensBurned: "5000",
    })

    // Check Owner balances
    await checkBalances(
      deployedERC1155Controller,
      ownerAccount,
      "Owner",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      5045,
      0,
      0,
      5000,
    )

    // Check AMM balances
    await checkBalances(
      deployedERC1155Controller,
      deployedAmm.address,
      "AMM",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      5046,
      0,
      0,
      0,
    )

    // Withdraw the rest
    receipt = await deployedAmm.withdrawCapital(initialCapital / 2, true, 5046)

    expectEvent(receipt, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "5046",
      lpTokensBurned: "5000",
    })

    // Check Owner balances
    await checkBalances(
      deployedERC1155Controller,
      ownerAccount,
      "Owner",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      10091,
      0,
      0,
      0, // LP made + 91 profit!
    )

    // Check AMM balances
    await checkBalances(
      deployedERC1155Controller,
      deployedAmm.address,
      "AMM",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      0,
      0,
      0,
      0,
    )
  })

  it("Expired ITM with exercise", async () => {
    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const lpToken = await SimpleToken.at(await deployedAmm.lpToken())

    const initialCapital = 10000e8
    // Approve collateral
    await underlyingToken.mint(ownerAccount, initialCapital)
    await underlyingToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    let receipt = await deployedAmm.provideCapital(initialCapital, 0)

    // Now let's do some trading from another account
    await underlyingToken.mint(aliceAccount, 1000e8)
    await underlyingToken.approve(deployedAmm.address, 1000e8, {
      from: aliceAccount,
    })

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toString(),
      initialCapital.toString(),
      "Total assets value in the AMM should be 10k",
    )

    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called
    // Check that AMM calculates correct bToken price
    assertBNEq(
      (await deployedAmm.getPriceForSeries(seriesId)).toString(),
      "21756000000000000".toString(), // 0.0217 * 1e18
      "AMM should calculate bToken price correctly",
    )

    // Buy bTokens
    receipt = await deployedAmm.bTokenBuy(seriesId, 3000e8, 3000e8, {
      from: aliceAccount,
    })

    // Check Alice balances
    // Alice paid ~91e8 for 3000e8 tokens at ~0.0217 + slippage
    await checkBalances(
      deployedERC1155Controller,
      aliceAccount,
      "Alice",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      90877362233,
      3000e8,
      0,
      0,
    )

    // Check AMM balances
    await checkBalances(
      deployedERC1155Controller,
      deployedAmm.address,
      "AMM",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      709122637767,
      0,
      3000e8,
      0,
    )

    // Check pool value before oracle update
    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toString(),
      (1002595837767).toString(), // ~7091e8 + 3000e8 * (1 - 0.0217) (btw, 10025 > 10000 - LPs are making money!!!)
      "Total assets value in the AMM should be correct",
    )

    // Increase Oracle price to put the option ITM
    await deployedMockPriceOracle.setLatestAnswer(25_000 * 10 ** 8)

    // Check options price after price change
    assertBNEq(
      (await deployedAmm.getPriceForSeries(seriesId)).toString(),
      "238850000000000000".toString(), // 0.238 * 1e18
      "AMM should calculate bToken price correctly",
    )
    // Check pool value after oracle update
    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toString(),
      (937467637767).toString(), // LPs are down by 649e8 = (0.238 - 0.0217) * 3000
      "Total assets value in the AMM should be correct",
    )

    // Move the block time into the exercise window
    await time.increase(ONE_WEEK_DURATION)

    // Alice exercises her options
    // 2,000(amount) * (25,000(price) - 20,000(strike)) / 25,000(price) = 400 collateral

    await deployedERC1155Controller.setApprovalForAll(
      deployedSeriesController.address,
      true,
      { from: aliceAccount },
    )
    await deployedSeriesController.exerciseOption(seriesId, 2000e8, true, {
      from: aliceAccount,
    })

    // Check Alice balances
    // She had 908 collateral + 400 exercised = 1,308
    // Alice profit = 1,308 - 1000 = 318
    await checkBalances(
      deployedERC1155Controller,
      aliceAccount,
      "Alice",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      130877362233, // 1308e8
      1000e8,
      0,
      0,
    )

    // Move the block time into the future so the contract is expired
    // TODO delete
    await time.increase(ONE_DAY)

    // Make sure series is expired
    assertBNEq(
      (await deployedSeriesController.state(seriesId)).toString(),
      STATE_EXPIRED.toString(),
      "Series should expire",
    )

    // Check unclaimed balances
    // 3,000 (initial) - 400 (exercised) - 200 (to be exercised) = 2,400
    const unredeemedCollateral =
      await deployedAmm.getCollateralValueOfAllExpiredOptionTokens()
    assertBNEq(
      unredeemedCollateral.toString(),
      (2400e8).toString(),
      "unredeemedCollateral should be correct",
    )

    // Check total value with and without unclaimed wTokens/bTokens
    assertBNEq(
      (await deployedAmm.getTotalPoolValue(false)).toString(),
      (709122637767).toString(), // 7091e8 - only collateral is valued, wTokens are expired
      "Total assets value excluding unclaimed in the AMM should be correct",
    )
    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toString(),
      (949122637767).toString(), // 7091 (collateral balance) + 2400 (unclaimed collateral) = 9,491
      "Total assets value in the AMM should be correct",
    )

    // Deposit additional liquidity after the exercise
    await underlyingToken.mint(bobAccount, 1000e8)
    await underlyingToken.approve(deployedAmm.address, 1000e8, {
      from: bobAccount,
    })

    // new LP token = 1,000 (deposit) / 9,491 (current value) * 10,000 (LP token supply) = 1,053
    receipt = await deployedAmm.provideCapital(1000e8, 0, { from: bobAccount })
    await checkBalances(
      deployedERC1155Controller,
      bobAccount,
      "Bob",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      0,
      0,
      0,
      105360462411,
    )

    // Bob withdraws liquidty
    receipt = await deployedAmm.withdrawCapital(
      105360462411,
      true,
      99999999999,
      {
        from: bobAccount,
      },
    )
    await checkBalances(
      deployedERC1155Controller,
      bobAccount,
      "Bob",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      99999999999, // ~1000e8 (the amount Bob deposited initially)
      0,
      0,
      0,
    )

    // We should be able to withdraw
    // We provided 100k in lp tokens, see if we can get it all back in 2 batches
    receipt = await deployedAmm.withdrawCapital(
      initialCapital / 2,
      true,
      474561318884,
    )

    expectEvent(receipt, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "474561318884",
      lpTokensBurned: "500000000000",
    })

    // Check Owner balances
    await checkBalances(
      deployedERC1155Controller,
      ownerAccount,
      "Owner",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      474561318884,
      0,
      0,
      500000000000,
    )

    // Check AMM balances
    await checkBalances(
      deployedERC1155Controller,
      deployedAmm.address,
      "AMM",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      474561318884,
      0,
      0,
      0,
    )

    // Owner withdraws the rest of the pool
    receipt = await deployedAmm.withdrawCapital(
      initialCapital / 2,
      true,
      474561318884,
    )

    expectEvent(receipt, "LpTokensBurned", {
      redeemer: ownerAccount,
      collateralRemoved: "474561318884",
      lpTokensBurned: "500000000000",
    })

    // Check Owner balances
    // Total LP loss = 10,000 - 9,491 = 509
    await checkBalances(
      deployedERC1155Controller,
      ownerAccount,
      "Owner",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      949122637768,
      0,
      0,
      0,
    )

    // Alice exercises the rest of her options
    await deployedSeriesController.exerciseOption(seriesId, 1000e8, true, {
      from: aliceAccount,
    })

    // Check Alice balances
    await checkBalances(
      deployedERC1155Controller,
      aliceAccount,
      "Alice",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      150877362233, // Alice gain = 1509 - 1000 = 509 (equals LP loss +/- precision)
      0,
      0,
      0,
    )

    // Check AMM balances
    await checkBalances(
      deployedERC1155Controller,
      deployedAmm.address,
      "AMM",
      underlyingToken,
      bTokenIndex,
      wTokenIndex,
      lpToken,
      0,
      0,
      0,
      0,
    )
  })

  it("should claimExpiredTokens succeed", async () => {
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called

    // create another series so we can call claimExpiredTokens on multiple series
    expiration = expiration + ONE_WEEK_DURATION

    const { seriesId: otherSeriesIndex } = await setupSeries({
      deployedSeriesController,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration,
      restrictedMinters: [deployedAmm.address],
      strikePrice: STRIKE_PRICE,
      isPutOption: false,
    })

    const initialCapital = 10000
    // Approve collateral
    await underlyingToken.mint(ownerAccount, initialCapital)
    await underlyingToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    await deployedAmm.provideCapital(initialCapital, 0)

    // Now let's do some trading from another account
    const aliceCollateralAmount = 1000
    await underlyingToken.mint(aliceAccount, aliceCollateralAmount)
    await underlyingToken.approve(deployedAmm.address, aliceCollateralAmount, {
      from: aliceAccount,
    })

    const BUY_AMOUNT = 3000

    // Buy bTokens from first series
    let ammReceipt = await deployedAmm.bTokenBuy(
      seriesId,
      BUY_AMOUNT,
      BUY_AMOUNT,
      { from: aliceAccount },
    )

    // Buy bTokens from second series
    ammReceipt = await deployedAmm.bTokenBuy(
      otherSeriesIndex,
      BUY_AMOUNT,
      BUY_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    // now there should be wTokens in the AMM
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const otherWTokenIndex = await deployedSeriesController.wTokenIndex(
      otherSeriesIndex,
    )

    // AMM should have non-zero amount of wTokens in both series, which later
    // it will claim
    assertBNEq(
      (
        await deployedERC1155Controller.balanceOf(
          deployedAmm.address,
          wTokenIndex,
        )
      ).toString(),
      BUY_AMOUNT.toString(),
      `deployedAmm should have correct wToken balance`,
    )
    assertBNEq(
      (
        await deployedERC1155Controller.balanceOf(
          deployedAmm.address,
          otherWTokenIndex,
        )
      ).toString(),
      BUY_AMOUNT.toString(),
      `deployedAmm should have correct otherWToken balance`,
    )

    // Move the block time into the future so the contract is expired
    await time.increaseTo(expiration)

    // Make sure series is expired
    assertBNEq(
      (await deployedSeriesController.state(seriesId)).toString(),
      STATE_EXPIRED.toString(),
      "Series should expire",
    )

    // now that we advanced forward to the expiration date, we can set the Series' matching
    // settlement price on the PriceOracle
    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    assertBNEq(
      (
        await deployedSeriesController.getSeriesERC20Balance(seriesId)
      ).toString(),
      BUY_AMOUNT.toString(),
      "Series should have some collateral token",
    )

    // now claim all of the tokens across all series
    const ammCollateralBeforeClaims = await underlyingToken.balanceOf(
      deployedAmm.address,
    )
    assertBNEq(
      ammCollateralBeforeClaims.toString(),
      (4242).toString(),
      "incorrect collateral value",
    )

    ammReceipt = await deployedAmm.claimExpiredTokens(seriesId, {
      from: aliceAccount,
    })

    const ammCollateralAfterFirstClaim = await underlyingToken.balanceOf(
      deployedAmm.address,
    )
    assertBNEq(
      ammCollateralAfterFirstClaim.toString(),
      ammCollateralBeforeClaims.add(new BN(BUY_AMOUNT)).toString(),
      "incorrect collateral value",
    )

    ammReceipt = await deployedAmm.claimExpiredTokens(otherSeriesIndex, {
      from: aliceAccount,
    })

    const CLAIM_EXPIRED_TOKENS_ENDING_BALANCE = await underlyingToken.balanceOf(
      deployedAmm.address,
    )
    assertBNEq(
      CLAIM_EXPIRED_TOKENS_ENDING_BALANCE.toString(),
      ammCollateralBeforeClaims
        .add(new BN(2).mul(new BN(BUY_AMOUNT)))
        .toString(),
      "incorrect collateral value",
    )
  })

  it("claimAllExpiredTokens should succeed", async () => {
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called
    // create another series so we can call claimExpiredTokens on multiple series
    expiration = expiration + ONE_WEEK_DURATION
    const { seriesId: otherSeriesIndex } = await setupSeries({
      deployedSeriesController,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration,
      restrictedMinters: [deployedAmm.address],
      strikePrice: STRIKE_PRICE,
      isPutOption: false,
    })

    const initialCapital = 10000
    // Approve collateral
    await underlyingToken.mint(ownerAccount, initialCapital)
    await underlyingToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    await deployedAmm.provideCapital(initialCapital, 0)

    // Now let's do some trading from another account
    const aliceCollateralAmount = 1000
    await underlyingToken.mint(aliceAccount, aliceCollateralAmount)
    await underlyingToken.approve(deployedAmm.address, aliceCollateralAmount, {
      from: aliceAccount,
    })

    const BUY_AMOUNT = 3000

    // Buy bTokens from first series
    let ammReceipt = await deployedAmm.bTokenBuy(
      seriesId,
      BUY_AMOUNT,
      BUY_AMOUNT,
      { from: aliceAccount },
    )

    // Buy bTokens from second series
    ammReceipt = await deployedAmm.bTokenBuy(
      otherSeriesIndex,
      BUY_AMOUNT,
      BUY_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    // now there should be wTokens in the AMM
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const otherWTokenIndex = await deployedSeriesController.wTokenIndex(
      otherSeriesIndex,
    )

    // AMM should have non-zero amount of wTokens in both series, which later
    // it will claim
    assertBNEq(
      (
        await deployedERC1155Controller.balanceOf(
          deployedAmm.address,
          wTokenIndex,
        )
      ).toString(),
      BUY_AMOUNT.toString(),
      `deployedAmm should have correct wToken balance`,
    )
    assertBNEq(
      (
        await deployedERC1155Controller.balanceOf(
          deployedAmm.address,
          otherWTokenIndex,
        )
      ).toString(),
      BUY_AMOUNT.toString(),
      `deployedAmm should have correct otherWToken balance`,
    )

    // Move the block time into the future so the contract is expired
    await time.increaseTo(expiration)

    // Make sure series is expired
    assertBNEq(
      (await deployedSeriesController.state(seriesId)).toString(),
      STATE_EXPIRED.toString(),
      "Series should expire",
    )

    // now that we advanced forward to the expiration date, we can set the Series' matching
    // settlement price on the PriceOracle
    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    assertBNEq(
      (
        await deployedSeriesController.getSeriesERC20Balance(seriesId)
      ).toString(),
      BUY_AMOUNT.toString(),
      "Series should have some collateral token",
    )

    // now claim all of the tokens across all series
    const ammCollateralBeforeClaims = await underlyingToken.balanceOf(
      deployedAmm.address,
    )
    assertBNEq(
      ammCollateralBeforeClaims.toString(),
      (4242).toString(),
      "incorrect collateral value",
    )

    ammReceipt = await deployedAmm.claimAllExpiredTokens({ from: aliceAccount })

    let CLAIM_ALL_EXPIRED_TOKENS_ENDING_BALANCE =
      await underlyingToken.balanceOf(deployedAmm.address)
    assertBNEq(
      CLAIM_ALL_EXPIRED_TOKENS_ENDING_BALANCE.toString(),
      ammCollateralBeforeClaims.add(new BN(2).mul(new BN(BUY_AMOUNT))),
      "incorrect collateral value",
    )
  })
})
