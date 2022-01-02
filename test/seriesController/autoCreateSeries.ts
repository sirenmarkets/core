/* global artifacts contract it assert */
import { expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { contract, assert, ethers } from "hardhat"
import {
  AddressesProviderInstance,
  AmmFactoryInstance,
  ERC1155ControllerInstance,
  MinterAmmInstance,
  SeriesControllerInstance,
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

const OTM_BTC_ORACLE_PRICE = 10_000 * 10 ** 8
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
  let deployedSeriesDeployer: SeriesDeployerInstance

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
    ;({ deployedSeriesController, deployedSeriesDeployer } =
      await setupSingletonTestContracts())

    const tokenAddress = "0x3CedE52cE5ED938cCBdfB1f821cb64ba2B2183c6"
    const min = 100
    const max = 1000
    const increment = 100

    // Verify it fails if a non owner calls it
    await expectRevert.unspecified(
      deployedSeriesDeployer.updateAllowedTokenStrikeRanges(
        tokenAddress,
        min,
        max,
        increment,
        { from: bobAccount },
      ),
    )

    // Verify param checks
    await expectRevert(
      deployedSeriesDeployer.updateAllowedTokenStrikeRanges(
        helpers.ADDRESS_ZERO,
        min,
        max,
        increment,
      ),
      ERROR_MESSAGES.INVALID_TOKEN,
    )

    await expectRevert(
      deployedSeriesDeployer.updateAllowedTokenStrikeRanges(
        tokenAddress,
        max,
        min,
        increment,
      ),
      ERROR_MESSAGES.INVALID_MIN_MAX,
    )

    await expectRevert(
      deployedSeriesDeployer.updateAllowedTokenStrikeRanges(
        tokenAddress,
        min,
        max,
        0,
      ),
      ERROR_MESSAGES.INVALID_INCREMENT,
    )

    const ret = await deployedSeriesDeployer.updateAllowedTokenStrikeRanges(
      tokenAddress,
      min,
      max,
      increment,
    )

    expectEvent(ret, "StrikeRangeUpdated", {
      strikeUnderlyingToken: tokenAddress,
      minPercent: new BN(min),
      maxPercent: new BN(max),
      increment: new BN(increment),
    })

    // Verify values are set
    const values = await deployedSeriesDeployer.allowedStrikeRanges(
      tokenAddress,
    )

    // @ts-ignore
    assertBNEq(values.minPercent, min, "min should be set")

    // @ts-ignore
    assertBNEq(values.maxPercent, max, "max should be set")

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
      deployedSeriesDeployer,
      expiration,
      deployedAmm,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: UNDERLYING_PRICE,
      annualizedVolatility: ANNUALIZED_VOLATILITY,
    }))

    const strikeMin = 50
    const strikeMax = 150
    const strikeIncrement = 10

    await deployedSeriesDeployer.updateAllowedTokenStrikeRanges(
      underlyingToken.address,
      strikeMin,
      strikeMax,
      strikeIncrement,
    )

    // Too low
    await expectRevert(
      deployedSeriesDeployer.autoCreateSeriesAndBuy(
        deployedAmm.address,
        99,
        expiration,
        false,
        1,
        1,
      ),
      "!low",
    )

    // Too high
    await expectRevert(
      deployedSeriesDeployer.autoCreateSeriesAndBuy(
        deployedAmm.address,
        20000e8,
        expiration,
        false,
        1,
        1,
      ),
      "!high",
    )

    // Not a valid increment
    await expectRevert(
      deployedSeriesDeployer.autoCreateSeriesAndBuy(
        deployedAmm.address,
        1000000000005,
        expiration,
        false,
        1,
        1,
      ),
      "!increment",
    )
  })

  it("Checks limit per expiration", async () => {
    ;({
      underlyingToken,
      collateralToken,
      priceToken,
      deployedSeriesController,
      expiration,
      deployedAmm,
      deployedAddressesProvider,
      deployedERC1155Controller,
      deployedSeriesDeployer,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: UNDERLYING_PRICE,
      annualizedVolatility: ANNUALIZED_VOLATILITY,
    }))

    // Add a new expiration
    const newExpiration = expiration + ONE_WEEK_DURATION
    await deployedSeriesController.updateAllowedExpirations([newExpiration])

    // Mint and approve tokens
    await underlyingToken.mint(aliceAccount, 10e8)
    await underlyingToken.approve(deployedSeriesDeployer.address, 10e8, {
      from: aliceAccount,
    })

    // Get the index count
    const beforeCount = await deployedSeriesController.latestIndex()

    await deployedSeriesDeployer.updateAllowedTokenStrikeRanges(
      underlyingToken.address,
      50, // min 50% of underlying price
      300, // max 300% of underlying price
      1e8,
    )

    // Create 15 series
    const promises = []
    for (let i = 0; i < 15; i++) {
      promises.push(
        deployedSeriesDeployer.autoCreateSeriesAndBuy(
          deployedAmm.address,
          STRIKE_PRICE + i * 1e8,
          newExpiration,
          false,
          1e4,
          1e4,
          {
            from: aliceAccount,
          },
        ),
      )
    }
    await Promise.all(promises)

    // Try creating another one
    await expectRevert(
      deployedSeriesDeployer.autoCreateSeriesAndBuy(
        deployedAmm.address,
        STRIKE_PRICE + 15 * 1e8,
        newExpiration,
        false,
        1e4,
        1e4,
        {
          from: aliceAccount,
        },
      ),
      "!limit",
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
      deployedSeriesDeployer,
    } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: UNDERLYING_PRICE,
      annualizedVolatility: ANNUALIZED_VOLATILITY,
    }))

    // Add a new expiration
    const newExpiration = expiration + ONE_WEEK_DURATION
    await deployedSeriesController.updateAllowedExpirations([newExpiration])

    // Mint and approve tokens
    await underlyingToken.mint(aliceAccount, 10e8)
    await underlyingToken.approve(deployedSeriesDeployer.address, 10e8, {
      from: aliceAccount,
    })

    // Get the index count
    const beforeCount = await deployedSeriesController.latestIndex()

    await deployedSeriesDeployer.updateAllowedTokenStrikeRanges(
      underlyingToken.address,
      50, // min 50% of underlying price
      150, // max 150% of underlying price
      1e8,
    )

    // Create the series and buy tokens
    await deployedSeriesDeployer.autoCreateSeriesAndBuy(
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
