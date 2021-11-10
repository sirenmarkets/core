import { expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { contract, assert } from "hardhat"
import {
  AmmDataProviderInstance,
  AmmDataProviderContract,
  ERC1155ControllerInstance,
  MinterAmmInstance,
  PriceOracleInstance,
  SeriesControllerInstance,
} from "../../typechain"
import { constants } from "@openzeppelin/test-helpers"
import { setupAllTestContracts } from "../util"
import { BlackScholesInstance } from "../../typechain/BlackScholes"

const ERROR_MESSAGES = {
  UNAUTHORIZED: "Ownable: caller is not the owner",
}

/**
 * Testing MinterAmm AmmDataProvider  updates
 */
contract("MinterAmm AmmDataProvider", (accounts) => {
  const ownerAccount = accounts[0]
  const bobAccount = accounts[2]

  const AmmDataProvider: AmmDataProviderContract =
    artifacts.require("AmmDataProvider")

  let deployedAmm: MinterAmmInstance
  let deployedSeriesController: SeriesControllerInstance
  let deployedERC1155Controller: ERC1155ControllerInstance
  let deployedAmmDataProvider: AmmDataProviderInstance
  let newDeployedAmmDataProvider: AmmDataProviderInstance
  let deployedPriceOracle: PriceOracleInstance
  let deployedBlackScholes: BlackScholesInstance

  beforeEach(async () => {
    ;({
      deployedAmm,
      deployedSeriesController,
      deployedERC1155Controller,
      deployedAmmDataProvider,
      deployedPriceOracle,
      deployedBlackScholes,
    } = await setupAllTestContracts({}))

    newDeployedAmmDataProvider = await AmmDataProvider.new(
      deployedSeriesController.address,
      deployedERC1155Controller.address,
      deployedPriceOracle.address,
      deployedBlackScholes.address,
    )
  })

  it("Correctly updates", async () => {
    // Ensure an non-owner can't edit the data provider
    await expectRevert(
      deployedAmm.updateAmmDataProvider(newDeployedAmmDataProvider.address, {
        from: bobAccount,
      }),
      ERROR_MESSAGES.UNAUTHORIZED,
    )

    // Ensure non-zero address
    await expectRevert(
      deployedAmm.updateAmmDataProvider(constants.ZERO_ADDRESS, {
        from: ownerAccount,
      }),
      "E14", // Invalid _ammDataProvider
    )

    // Set it with the owner account
    let ret = await deployedAmm.updateAmmDataProvider(
      newDeployedAmmDataProvider.address,
      {
        from: ownerAccount,
      },
    )
    expectEvent(ret, "NewAmmDataProvider", {
      newAmmDataProvider: newDeployedAmmDataProvider.address,
    })

    // Verify it got set correctly
    assert.equal(
      await deployedAmm.ammDataProvider(),
      newDeployedAmmDataProvider.address,
      "New AmmDataProvider should be set",
    )
  })
})
