/* global artifacts contract it assert */
import { expectRevert, expectEvent, BN } from "@openzeppelin/test-helpers"
import { contract } from "hardhat"
import { SeriesControllerInstance } from "../../typechain"

import {
  setupSingletonTestContracts,
  getNextFriday8amUTCTimestamp,
  assertBNEq,
} from "../util"

contract("Series Expirations", (accounts) => {
  const aliceAccount = accounts[1]

  // Set the expiration to 2 days from now
  let expiration: number
  let deployedSeriesController: SeriesControllerInstance

  beforeEach(async () => {})

  // Do a covered call - lock up bitcoin at a specific price
  it("Validates Inputs on Expiration calls", async () => {
    ;({ deployedSeriesController, expiration } =
      await setupSingletonTestContracts())

    // Verify ownership check
    await expectRevert(
      deployedSeriesController.updateAllowedExpirations([expiration], {
        from: aliceAccount,
      }),
      "SeriesController: Caller is not the owner",
    )

    // Verify setting an expiration works from owner acct
    await deployedSeriesController.updateAllowedExpirations([expiration])

    // Verify adding the same one doesn't work since it is not greater than the last
    await expectRevert(
      deployedSeriesController.updateAllowedExpirations([expiration]),
      "Order!",
    )

    // Verify adding a later non-aligned (not 8 AM) gets rejected
    await expectRevert(
      deployedSeriesController.updateAllowedExpirations([expiration + 500]),
      "Nonaligned",
    )

    // Add a second and third one
    const date2 = getNextFriday8amUTCTimestamp(expiration + 1000)
    const date3 = getNextFriday8amUTCTimestamp(date2 + 1000)
    let ret = await deployedSeriesController.updateAllowedExpirations([
      date2,
      date3,
    ])

    // Verify events
    expectEvent(ret, "AllowedExpirationUpdated", {
      newAllowedExpiration: new BN(date2),
    })
    expectEvent(ret, "AllowedExpirationUpdated", {
      newAllowedExpiration: new BN(date3),
    })

    // Verify the list and map are updated
    assertBNEq(
      await deployedSeriesController.allowedExpirationsMap(expiration),
      0,
      "map should be set",
    )
    assertBNEq(
      await deployedSeriesController.allowedExpirationsMap(date2),
      1,
      "map should be set",
    )
    assertBNEq(
      await deployedSeriesController.allowedExpirationsMap(date3),
      2,
      "map should be set",
    )

    assertBNEq(
      await deployedSeriesController.allowedExpirationsList(0),
      expiration,
      "list should be set",
    )
    assertBNEq(
      await deployedSeriesController.allowedExpirationsList(1),
      date2,
      "list should be set",
    )
    assertBNEq(
      await deployedSeriesController.allowedExpirationsList(2),
      date3,
      "list should be set",
    )
  })
})
