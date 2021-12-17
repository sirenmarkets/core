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

    const date1 = getNextFriday8amUTCTimestamp(expiration + 1000)

    // Verify ownership check
    await expectRevert(
      deployedSeriesController.updateAllowedExpirations([date1], {
        from: aliceAccount,
      }),
      "SeriesController: Caller is not the owner",
    )

    // Verify setting an expiration works from owner acct
    await deployedSeriesController.updateAllowedExpirations([date1])

    // Verify adding the same one doesn't work since it is not greater than the last
    await expectRevert(
      deployedSeriesController.updateAllowedExpirations([date1]),
      "Order!",
    )

    // Verify adding a later non-aligned (not 8 AM) gets rejected
    await expectRevert(
      deployedSeriesController.updateAllowedExpirations([date1 + 500]),
      "Nonaligned",
    )

    // Add a second and third one
    const date2 = getNextFriday8amUTCTimestamp(date1 + 1000)
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
      1,
      "map should be set",
    )
    assertBNEq(
      await deployedSeriesController.allowedExpirationsMap(date1),
      2,
      "map should be set",
    )
    assertBNEq(
      await deployedSeriesController.allowedExpirationsMap(date2),
      3,
      "map should be set",
    )
    assertBNEq(
      await deployedSeriesController.allowedExpirationsMap(date3),
      4,
      "map should be set",
    )

    assertBNEq(
      await deployedSeriesController.allowedExpirationsList(1),
      expiration,
      "list should be set",
    )

    assertBNEq(
      await deployedSeriesController.allowedExpirationsList(2),
      date1,
      "list should be set",
    )
    assertBNEq(
      await deployedSeriesController.allowedExpirationsList(3),
      date2,
      "list should be set",
    )
    assertBNEq(
      await deployedSeriesController.allowedExpirationsList(4),
      date3,
      "list should be set",
    )
  })
})
