/* global artifacts contract it assert */
import { expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { contract, assert } from "hardhat"
import { SeriesControllerInstance } from "../../typechain"
import helpers from "../testHelpers"

import { assertBNEq, ONE_WEEK_DURATION } from "../util"

const ERROR_MESSAGES = {
  INVALID_ARRAYS: "!Order",
  INVALID_TOKEN: "!Token",
  INVALID_MIN_MAX: "!min/max",
  INVALID_INCREMENT: "!increment",
}

import { setupSingletonTestContracts, setupSeries } from "../util"

contract("Auto Series Creation", (accounts) => {
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  let deployedSeriesController: SeriesControllerInstance
  let expiration: number

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
})
