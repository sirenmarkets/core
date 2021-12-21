test / seriesController / autoCreateSeries.ts

/* global artifacts contract it assert */
import { expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { contract, assert } from "hardhat"
import { SeriesControllerInstance } from "../../typechain"
import helpers from "../testHelpers"

import { assertBNEq } from "../util"

const ERROR_MESSAGES = {
  INVALID_ARRAYS: "Invalid lengths",
  INVALID_TOKEN: "Invalid Token",
  INVALID_MIN_MAX: "Invalid min/max",
  INVALID_INCREMENT: "Invalid increment",
}

import { setupSingletonTestContracts, setupSeries } from "../util"

contract("Auto Series Creation", (accounts) => {
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  let deployedSeriesController: SeriesControllerInstance

  beforeEach(async () => {})

  it("Allows the owner to update the expiration dates", async () => {
    ;({ deployedSeriesController } = await setupSingletonTestContracts())

    const timestamps = [0, 1]
    const allowedFlags = [true, false]

    // Verify it fails if a non owner calls it
    await expectRevert.unspecified(
      deployedSeriesController.updateAllowedExpirations(
        timestamps,
        allowedFlags,
        { from: bobAccount },
      ),
    )

    // Verify it fails with non equal arrays
    await expectRevert(
      deployedSeriesController.updateAllowedExpirations([0, 1], [true]),
      ERROR_MESSAGES.INVALID_ARRAYS,
    )

    const ret = await deployedSeriesController.updateAllowedExpirations(
      timestamps,
      allowedFlags,
    )

    // Verify events
    expectEvent(ret, "AllowedExpirationUpdated", {
      timestamp: new BN(0),
      allowed: true,
    })

    expectEvent(ret, "AllowedExpirationUpdated", {
      timestamp: new BN(1),
      allowed: false,
    })

    // Verify storage
    assert.equal(
      await deployedSeriesController.allowedExpirations(new BN(0)),
      true,
      "Expiration should be set",
    )

    assert.equal(
      await deployedSeriesController.allowedExpirations(new BN(1)),
      false,
      "Expiration should be set",
    )

    assert.equal(
      await deployedSeriesController.allowedExpirations(new BN(2)),
      false,
      "Expiration should not be set by default",
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
