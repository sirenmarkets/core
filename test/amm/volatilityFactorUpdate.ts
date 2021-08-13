import { expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { contract, assert } from "hardhat"
import { MinterAmmInstance } from "../../typechain"

import { setupAllTestContracts } from "../util"

const ERROR_MESSAGES = {
  UNAUTHORIZED: "Ownable: caller is not the owner",
}

/**
 * Testing MinterAmm volatility factor updates
 */
contract("Volatility Factor", (accounts) => {
  const ownerAccount = accounts[0]
  const bobAccount = accounts[2]

  let deployedAmm: MinterAmmInstance

  beforeEach(async () => {
    ;({ deployedAmm } = await setupAllTestContracts({}))
  })

  it("Enforces Limits", async () => {
    // Ensure an non-owner can't edit the vol factor
    await expectRevert(
      deployedAmm.setVolatilityFactor("10000001", { from: bobAccount }),
      ERROR_MESSAGES.UNAUTHORIZED,
    )

    // Ensure lower bound is enforced
    await expectRevert(
      deployedAmm.setVolatilityFactor("1000", { from: ownerAccount }),
      "E09", // "VolatilityFactor is too low"
    )

    const newVol = new BN(1000).mul(new BN(10).pow(new BN(10)))

    // Set it with the owner account
    let ret = await deployedAmm.setVolatilityFactor(newVol, {
      from: ownerAccount,
    })
    expectEvent(ret, "VolatilityFactorUpdated", {
      newVolatilityFactor: newVol,
    })

    // Verify it got set correctly
    assert.equal(
      await deployedAmm.volatilityFactor(),
      newVol.toString(),
      "Vol factor should be set",
    )
  })
})
