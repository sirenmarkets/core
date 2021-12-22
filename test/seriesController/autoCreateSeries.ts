/* global artifacts contract it assert */
import { expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { contract, assert, ethers } from "hardhat"
import {
  AddressesProviderInstance,
  AmmFactoryInstance,
  ERC1155ControllerInstance,
  MinterAmmInstance,
  SeriesControllerInstance,
  SeriesDeployerContract,
  SeriesDeployerInstance,
  SimpleTokenInstance,
} from "../../typechain"
import helpers from "../testHelpers"

import { assertBNEq, ONE_WEEK_DURATION, setupAllTestContracts } from "../util"

const ERROR_MESSAGES = {
  INVALID_ARRAYS: "!Order",
  INVALID_TOKEN: "!Token",
  INVALID_MIN_MAX: "!min/max",
  INVALID_INCREMENT: "!increment",
}

const OTM_BTC_ORACLE_PRICE = 14_000 * 10 ** 8
const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const UNDERLYING_PRICE = OTM_BTC_ORACLE_PRICE
const ANNUALIZED_VOLATILITY = 1 * 1e8 // 100%

import { setupSingletonTestContracts, setupSeries } from "../util"

contract("Auto Series Creation", (accounts) => {
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  let deployedSeriesController: SeriesControllerInstance
  let expiration: number
  let underlyingToken: SimpleTokenInstance
  let collateralToken: SimpleTokenInstance
  let priceToken: SimpleTokenInstance
  let deployedERC1155Controller: ERC1155ControllerInstance
  let deployedAmm: MinterAmmInstance
  let deployedAddressesProvider: AddressesProviderInstance

  beforeEach(async () => {})

  it("Allows the owner to update the expiration dates", async () => {
    ;({ deployedSeriesController, expiration } =
      await setupSingletonTestContracts())

    const timestamps = [
      expiration + ONE_WEEK_DURATION,
      expiration + 2 * ONE_WEEK_DURATION,
    ]

    // Verify it fails if a non owner calls it
    await expectRevert.unspecified(
      deployedSeriesController.updateAllowedExpirations(timestamps, {
        from: bobAccount,
      }),
    )

    const ret = await deployedSeriesController.updateAllowedExpirations(
      timestamps,
    )

    // Verify events
    expectEvent(ret, "AllowedExpirationUpdated", {
      newAllowedExpiration: new BN(timestamps[0]),
    })

    expectEvent(ret, "AllowedExpirationUpdated", {
      newAllowedExpiration: new BN(timestamps[1]),
    })

    // Verify storage
    assertBNEq(
      await deployedSeriesController.allowedExpirationsList(new BN(1)),
      expiration,
      "Expiration should be set",
    )

    assertBNEq(
      await deployedSeriesController.allowedExpirationsList(new BN(2)),
      timestamps[0],
      "Expiration should be set",
    )

    assertBNEq(
      await deployedSeriesController.allowedExpirationsList(new BN(3)),
      timestamps[1],
      "Expiration should be set",
    )
  })

  it("Allows the owner to update the strike ranges", async () => {
    ;({ deployedSeriesController } = await setupSingletonTestContracts())

    const tokenAddress = "0x3CedE52cE5ED938cCBdfB1f821cb64ba2B2183c6"
    const min = 100
    const max = 1000
    const increment = 100

    // Verify it fails if a non owner calls it
    await expectRevert.unspecified(
      deployedSeriesController.updateAllowedTokenStrikeRanges(
        tokenAddress,
        min,
        max,
        increment,
        { from: bobAccount },
      ),
    )

    // Verify param checks
    await expectRevert(
      deployedSeriesController.updateAllowedTokenStrikeRanges(
        helpers.ADDRESS_ZERO,
        min,
        max,
        increment,
      ),
      ERROR_MESSAGES.INVALID_TOKEN,
    )

    await expectRevert(
      deployedSeriesController.updateAllowedTokenStrikeRanges(
        tokenAddress,
        max,
        min,
        increment,
      ),
      ERROR_MESSAGES.INVALID_MIN_MAX,
    )

    await expectRevert(
      deployedSeriesController.updateAllowedTokenStrikeRanges(
        tokenAddress,
        min,
        max,
        0,
      ),
      ERROR_MESSAGES.INVALID_INCREMENT,
    )

    const ret = await deployedSeriesController.updateAllowedTokenStrikeRanges(
      tokenAddress,
      min,
      max,
      increment,
    )

    expectEvent(ret, "StrikeRangeUpdated", {
      strikeUnderlyingToken: tokenAddress,
      min: new BN(min),
      max: new BN(max),
      increment: new BN(increment),
    })

    // Verify values are set
    const values = await deployedSeriesController.allowedStrikeRanges(
      tokenAddress,
    )

    // @ts-ignore
    assertBNEq(values.min, min, "min should be set")

    // @ts-ignore
    assertBNEq(values.max, max, "max should be set")

    // @ts-ignore
    assertBNEq(values.increment, increment, "increment should be set")
  })

  it("Checks series creator role", async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      expiration,
      deployedAmm,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: UNDERLYING_PRICE,
      annualizedVolatility: ANNUALIZED_VOLATILITY,
    }))

    await expectRevert(
      deployedSeriesController.createSeries(
        {
          underlyingToken: underlyingToken.address,
          collateralToken: collateralToken.address,
          priceToken: priceToken.address,
        },
        [100],
        [expiration],
        [deployedAmm.address],
        false,
        { from: accounts[2] },
      ),
      "!deployer",
    )
  })

  it("Checks expirations", async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      expiration,
      deployedAmm,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: UNDERLYING_PRICE,
      annualizedVolatility: ANNUALIZED_VOLATILITY,
    }))

    await expectRevert(
      deployedSeriesController.createSeries(
        {
          underlyingToken: underlyingToken.address,
          collateralToken: collateralToken.address,
          priceToken: priceToken.address,
        },
        [100],
        [expiration + ONE_WEEK_DURATION],
        [deployedAmm.address],
        false,
      ),
      "!expiration",
    )
  })

  it("Checks strikes", async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      expiration,
      deployedAmm,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: UNDERLYING_PRICE,
      annualizedVolatility: ANNUALIZED_VOLATILITY,
    }))

    const strikeMin = 100
    const strikeMax = 1000
    const strikeIncrement = 10

    await deployedSeriesController.updateAllowedTokenStrikeRanges(
      underlyingToken.address,
      strikeMin,
      strikeMax,
      strikeIncrement,
    )

    // Too low
    await expectRevert(
      deployedSeriesController.createSeries(
        {
          underlyingToken: underlyingToken.address,
          collateralToken: collateralToken.address,
          priceToken: priceToken.address,
        },
        [99],
        [expiration],
        [deployedAmm.address],
        false,
      ),
      "!low",
    )

    // Too high
    await expectRevert(
      deployedSeriesController.createSeries(
        {
          underlyingToken: underlyingToken.address,
          collateralToken: collateralToken.address,
          priceToken: priceToken.address,
        },
        [1001],
        [expiration],
        [deployedAmm.address],
        false,
      ),
      "!high",
    )

    // Not a valid increment
    await expectRevert(
      deployedSeriesController.createSeries(
        {
          underlyingToken: underlyingToken.address,
          collateralToken: collateralToken.address,
          priceToken: priceToken.address,
        },
        [105],
        [expiration],
        [deployedAmm.address],
        false,
      ),
      "!increment",
    )
  })

  it("Allows series deployer to create", async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      expiration,
      deployedAmm,
      deployedAddressesProvider,
      deployedERC1155Controller,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: UNDERLYING_PRICE,
      annualizedVolatility: ANNUALIZED_VOLATILITY,
    }))

    // Create the series deployer contract
    const seriesDeployerContract: SeriesDeployerContract =
      artifacts.require("SeriesDeployer")
    const seriesDeployer = await seriesDeployerContract.new()
    await seriesDeployer.__SeriesDeployer_init(
      deployedAddressesProvider.address,
    )

    // Add the series deployer contract to the allowed creators list
    await deployedSeriesController.grantRole(
      await deployedSeriesController.SERIES_DEPLOYER_ROLE(),
      seriesDeployer.address,
    )

    // Add a new expiration
    const newExpiration = expiration + ONE_WEEK_DURATION
    await deployedSeriesController.updateAllowedExpirations([newExpiration])

    // Mint and approve tokens
    await underlyingToken.mint(aliceAccount, 10e8)
    await underlyingToken.approve(seriesDeployer.address, 10e8, {
      from: aliceAccount,
    })

    // Get the index count
    const beforeCount = await deployedSeriesController.latestIndex()

    // Create the series and buy tokens
    await seriesDeployer.autoCreateSeriesAndBuy(
      deployedAmm.address,
      STRIKE_PRICE,
      newExpiration,
      false,
      1e8,
      1e8,
      {
        from: aliceAccount,
      },
    )

    // Ensure the series index was incremented to show the series was created
    const afterCount = await deployedSeriesController.latestIndex()
    assert(
      afterCount.eq(beforeCount.add(new BN(1))),
      "New series should update index",
    )

    // Verify bTokens - series ID is current - 1
    const bTokenIndex = await deployedSeriesController.bTokenIndex(beforeCount)
    assertBNEq(
      await deployedERC1155Controller.balanceOf(aliceAccount, bTokenIndex),
      1e8,
      "bTokens should be purchased",
    )

    // Verify Alice got back unused collateral
    const collateralBalance = await underlyingToken.balanceOf(aliceAccount)
    assert(
      collateralBalance.gt(new BN(0)),
      "Alice should not have spent all funds",
    )
  })
})
