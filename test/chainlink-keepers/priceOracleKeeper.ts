import { time, expectEvent, expectRevert, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract } from "hardhat"
import {
  MockPriceOracleContract,
  MockPriceOracleInstance,
  PriceOracleInstance,
  PriceOracleKeeperContract,
  PriceOracleKeeperInstance,
  AddressesProviderInstance,
  SimpleTokenInstance,
} from "../../typechain"

import { assertBNEq, setupSingletonTestContracts } from "../util"

const MockPriceOracle: MockPriceOracleContract =
  artifacts.require("MockPriceOracle")

const PriceOracleKeeper: PriceOracleKeeperContract =
  artifacts.require("PriceOracleKeeper")

let deployedMockPriceOracle: MockPriceOracleInstance
let deployedMockPriceOracle2: MockPriceOracleInstance
let deployedPriceOracle: PriceOracleInstance
let priceOracleKeeper: PriceOracleKeeperInstance
let deployedAddressesProvider: AddressesProviderInstance
let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance

const underlyingToken2Address = "0x1574e9cb330def04be5a639f57dd52037a2ad206"

contract("AMM Call Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  beforeEach(async () => {
    ;({
      deployedMockPriceOracle,
      deployedPriceOracle,
      deployedAddressesProvider,
      underlyingToken,
      priceToken,
    } = await setupSingletonTestContracts())

    deployedMockPriceOracle2 = await MockPriceOracle.new(18)

    await deployedMockPriceOracle.setLatestAnswer(3000)
    await deployedMockPriceOracle2.setLatestAnswer(100)

    await deployedPriceOracle.addTokenPair(
      underlyingToken2Address,
      priceToken.address,
      deployedMockPriceOracle2.address,
    )

    priceOracleKeeper = await PriceOracleKeeper.new(
      deployedAddressesProvider.address,
    )
  })

  it("Returns false when no upkeep is needed", async () => {
    let result = await priceOracleKeeper.contract.methods
      .checkUpkeep("0x0")
      .call()
    assert(result.upkeepNeeded == false, "upkeepNeeded should be false")
  })

  it("Performs upkeep when needed", async () => {
    const previousSettlementTime =
      await deployedPriceOracle.get8amWeeklyOrDailyAligned(await time.latest())

    // increase time to next week
    await time.increaseTo(previousSettlementTime.add(new BN(60 * 60 * 24 * 7)))

    const currentSettlementTime =
      await deployedPriceOracle.get8amWeeklyOrDailyAligned(await time.latest())

    let result = await priceOracleKeeper.contract.methods
      .checkUpkeep("0x0")
      .call()
    assert(result.upkeepNeeded == true, "upkeepNeeded should be true")

    // Check that settlement price is not set before upkeep
    result = await deployedPriceOracle.getSettlementPrice(
      underlyingToken.address,
      priceToken.address,
      currentSettlementTime,
    )
    assert(result[0] == false, "settlementPrice should not be set")

    // perform upkeep
    await priceOracleKeeper.performUpkeep("0x0")

    // Ceck that settlement price is set after the upkeep
    assertBNEq(
      (
        await deployedPriceOracle.getSettlementPrice(
          underlyingToken.address,
          priceToken.address,
          currentSettlementTime,
        )
      )[1],
      "3000",
      "settlementPrice should be set",
    )
    assertBNEq(
      (
        await deployedPriceOracle.getSettlementPrice(
          underlyingToken2Address,
          priceToken.address,
          currentSettlementTime,
        )
      )[1],
      "100",
      "settlementPrice should be set",
    )

    // Check that upkeep is not needed anymore
    result = await priceOracleKeeper.contract.methods.checkUpkeep("0x0").call()
    assert(result.upkeepNeeded == false, "upkeepNeeded should be false")
  })
})
