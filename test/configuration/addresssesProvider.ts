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

const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const BTC_ORACLE_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

const ERROR_MESSAGES = {
  MIN_TRADE_SIZE: "Buy/Sell amount below min size",
}

contract("Address Provider Set/Get Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  beforeEach(async () => {
    ;({ deployedAddressesProvider, deployedSeriesController } =
      await setupAllTestContracts({
        strikePrice: STRIKE_PRICE.toString(),
        oraclePrice: BTC_ORACLE_PRICE,
        isPutOption: true,
      }))
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
      0x0000000000000000000000000000000000000000,
      "Get Address should return a blank address",
    )
  })
})
