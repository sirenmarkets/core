/* global artifacts contract it assert */
import {
  time,
  expectEvent,
  expectRevert,
  BN,
  address,
} from "@openzeppelin/test-helpers"
import { artifacts, contract, assert } from "hardhat"
import {
  SeriesControllerInstance,
  AddressesProviderInstance,
} from "../../typechain"

import { setupAllTestContracts, assertBNEq, ONE_WEEK_DURATION } from "../util"

let deployedSeriesController: SeriesControllerInstance
let deployedAddressesProvider: AddressesProviderInstance

contract("Address Provider Set/Get Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  beforeEach(async () => {
    ;({ deployedAddressesProvider, deployedSeriesController } =
      await setupAllTestContracts())
  })

  it("Successfully set a contracts address", async () => {
    // Providing capital before approving should fail
    let ret = await deployedAddressesProvider.setSeriesController(
      deployedSeriesController.address,
    )

    expectEvent(ret, "SeriesControllerUpdated", {})

    let getAddress = await deployedAddressesProvider.getSeriesController()

    // Total assets value in the AMM should be 10k.
    assert.isNotNull(getAddress, "Get Address should return an address")

    assert.notEqual(
      getAddress,
      "0x0000000000000000000000000000000000000000",
      "Get Address should not return a blank address",
    )
  })

  it("Address is not set yet so it returns an empty address", async () => {
    // Providing capital before approving should fail

    let getAddress = await deployedAddressesProvider.getSeriesController()

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      getAddress,
      "0x0000000000000000000000000000000000000000",
      "Get Address should return a blank address",
    )
  })
})
