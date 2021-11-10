import { expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { MinterAmmInstance } from "../../typechain"
import { artifacts, contract, assert } from "hardhat"

import { setupAllTestContracts } from "../util"
import { BlackScholesInstance } from "../../typechain/BlackScholes"

const ERROR_MESSAGES = {
  UNAUTHORIZED: "Ownable: caller is not the owner",
}

/**
 * Testing MinterAmm pricing when volatility and deep in money cannot go over 100%
 */
contract("Max Pricing", (accounts) => {
  const ownerAccount = accounts[0]
  const bobAccount = accounts[2]

  let deployedAmm: MinterAmmInstance
  let deployedBlackScholes: BlackScholesInstance

  beforeEach(async () => {
    ;({ deployedAmm, deployedBlackScholes } = await setupAllTestContracts({}))
  })

  it("Verifies Pricing defaults to 1 for for deep ITM calls", async () => {
    // An out of the money option expiring in 1 day
    let ret = await deployedBlackScholes.optionPrices(
      new BN(60 * 60 * 24),
      100,
      90,
      185195332040632,
      0,
    )

    assert.isTrue(
      ret[0].lte(new BN(10).pow(new BN(18))),
      "Calculated price should be below 1",
    )

    // Deep in the money should max out at 1 (aka 10^18)
    ret = await deployedBlackScholes.optionPrices(
      new BN(60 * 60 * 24),
      100,
      9000000000,
      185195332040632,
      0,
    )

    assert.isTrue(
      ret[0].lte(new BN(10).pow(new BN(18))),
      "Calculated price should be below 1",
    )
  })

  it("Verifies Pricing defaults to 1 for deep ITM puts", async () => {
    // An out of the money option expiring in 1 day
    let ret = await deployedBlackScholes.optionPrices(
      new BN(60 * 60 * 24),
      90,
      100,
      185195332040632,
      0,
    )

    assert.isTrue(
      ret[1].lte(new BN(10).pow(new BN(18))),
      "Calculated price should be below 1",
    )

    // Deep in the money should max out at 1 (aka 10^18)
    ret = await deployedBlackScholes.optionPrices(
      new BN(60 * 60 * 24),
      9000000000,
      100,
      185195332040632,
      0,
    )

    assert.isTrue(
      ret[1].lte(new BN(10).pow(new BN(18))),
      "Calculated price should be below 1",
    )
  })
})
