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
  AddressesProviderContract,
  ProxyContract,
} from "../../typechain"

import { setupAllTestContracts, assertBNEq, ONE_WEEK_DURATION } from "../util"

let deployedSeriesController: SeriesControllerInstance
let deployedAddressesProvider: AddressesProviderInstance

// Helper function to deploy addresses provider
const deploy = async (): Promise<AddressesProviderInstance> => {
  const Proxy: ProxyContract = artifacts.require("Proxy")
  const AddressesProvider: AddressesProviderContract =
    artifacts.require("AddressesProvider")
  const addressesProviderLogic = await AddressesProvider.deployed()
  const proxyAddressesProvider = await Proxy.new(addressesProviderLogic.address)
  const deployedAddressesProvider2 = await AddressesProvider.at(
    proxyAddressesProvider.address,
  )

  return deployedAddressesProvider2
}

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
    //WE need to set up a second addresses provider to make sure that our addresses are not set when contract is initalized
    const Proxy: ProxyContract = artifacts.require("Proxy")
    const AddressesProvider: AddressesProviderContract =
      artifacts.require("AddressesProvider")
    const addressesProviderLogic = await AddressesProvider.deployed()
    const proxyAddressesProvider = await Proxy.new(
      addressesProviderLogic.address,
    )
    const deployedAddressesProvider2 = await AddressesProvider.at(
      proxyAddressesProvider.address,
    )

    deployedAddressesProvider2.__AddressessProvider_init()

    let getAddress = await deployedAddressesProvider2.getSeriesController()

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      getAddress,
      "0x0000000000000000000000000000000000000000",
      "Get Address should return a blank address",
    )
  })

  it("Verifies AmmFactory Address", async () => {
    const randomAddress = accounts[5]

    const addrProvider = await deploy()
    addrProvider.__AddressessProvider_init()

    // Verify non admin can't set address
    await expectRevert(
      addrProvider.setAmmFactory(randomAddress, { from: accounts[2] }),
      "Ownable: caller is not the owner",
    )

    // Update the address
    let ret = await addrProvider.setAmmFactory(randomAddress)
    expectEvent(ret, "AmmFactoryUpdated", {
      newAddress: randomAddress,
    })

    // Get and verify
    const addr = await addrProvider.getAmmFactory()
    assert.equal(addr, randomAddress)
  })

  it("Verifies Erc1155Controller Address", async () => {
    const randomAddress = accounts[5]

    const addrProvider = await deploy()
    addrProvider.__AddressessProvider_init()

    // Verify non admin can't set address
    await expectRevert(
      addrProvider.setErc1155Controller(randomAddress, { from: accounts[2] }),
      "Ownable: caller is not the owner",
    )

    // Update the address
    let ret = await addrProvider.setErc1155Controller(randomAddress)
    expectEvent(ret, "Erc1155ControllerUpdated", {
      newAddress: randomAddress,
    })

    // Get and verify
    const addr = await addrProvider.getErc1155Controller()
    assert.equal(addr, randomAddress)
  })
})
