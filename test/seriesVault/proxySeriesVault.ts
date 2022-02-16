/* global artifacts contract it assert */
import { expectRevert, constants } from "@openzeppelin/test-helpers"
import { contract, assert } from "hardhat"

import { SeriesVaultContract } from "../../typechain"

const SeriesVault: SeriesVaultContract = artifacts.require("SeriesVault")

import { setupAllTestContracts, assertBNEq } from "../util"

contract("Proxy Vault Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]

  it("Cannot initialize twice", async () => {
    const { deployedSeriesController, deployedVault } =
      await setupAllTestContracts()
    await expectRevert(
      deployedVault.__SeriesVault_init(deployedSeriesController.address),
      "Initializable: contract is already initialized",
    )
  })

  it("setERC20ApprovalForController should succeed and fail as expected", async () => {
    const { deployedSeriesController, deployedVault, collateralToken } =
      await setupAllTestContracts()

    // should fail unless the vault's controller is the caller
    await expectRevert(
      deployedVault.setERC20ApprovalForController(collateralToken.address),
      "SeriesVault: Sender must be the seriesController",
    )

    // since setupAllTestContracts calls SeriesController.createSeries, which calls setERC20ApprovalForController
    // for the collateralToken, we should see that the allowance has been set correctly
    assertBNEq(
      await collateralToken.allowance(
        deployedVault.address,
        deployedSeriesController.address,
      ),
      constants.MAX_UINT256,
      "allowance not set correctly",
    )
  })

  it("setERC1155ApprovalForController should succeed and fail as expected", async () => {
    const {
      deployedSeriesController,
      deployedVault,
      deployedERC1155Controller,
    } = await setupAllTestContracts()

    // should fail unless the vault's controller is the caller
    await expectRevert(
      deployedVault.setERC1155ApprovalForController(
        deployedERC1155Controller.address,
      ),
      "SeriesVault: Sender must be the seriesController",
    )

    // since setupAllTestContracts calls SeriesController.__SeriesController_init, which calls
    // setERC1155ApprovalForController, we should see that the allowance has been set correctly
    assert.strictEqual(
      await deployedERC1155Controller.isApprovedForAll(
        deployedVault.address,
        deployedSeriesController.address,
      ),
      true,
      "approval not set correctly",
    )
  })

  it("should upgrade correctly", async () => {
    const { deployedVault } = await setupAllTestContracts()
    const newImpl = await SeriesVault.new()

    // should fail to upgrade if not admin
    await expectRevert(
      deployedVault.updateImplementation(newImpl.address, {
        from: aliceAccount,
      }),
      "Ownable: caller is not the owner",
    )

    // now make sure it changes when we update the implementation

    const existingImplAddress = await deployedVault.getLogicAddress()

    await deployedVault.updateImplementation(newImpl.address)

    const newImplAddress = await deployedVault.getLogicAddress()

    assert(existingImplAddress !== newImplAddress)
    assert(newImplAddress === (await deployedVault.getLogicAddress()))
  })
})
