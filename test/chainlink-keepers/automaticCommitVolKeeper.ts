import {
  now,
  getNextFriday8amUTCTimestamp,
  setupAllTestContracts,
  assertBNEq,
} from "../util"

import { time } from "@openzeppelin/test-helpers"
import { artifacts, contract, ethers } from "hardhat"
const { provider } = ethers
import { AutomaticClaimVolKeeperContract } from "../../typechain"

const AutomaticClaimVolKeeper: AutomaticClaimVolKeeperContract =
  artifacts.require("AutomaticClaimVolKeeper")
const PERIOD = 86400

const WINDOW_IN_DAYS = 90 // 3 month vol data
const getTopOfPeriod = async () => {
  const latestTimestamp = (await provider.getBlock("latest")).timestamp
  let topOfPeriod: number
  const rem = latestTimestamp % PERIOD
  if (rem < Math.floor(PERIOD / 2)) {
    topOfPeriod = latestTimestamp - rem + PERIOD
  } else {
    topOfPeriod = latestTimestamp + rem + PERIOD
  }
  return topOfPeriod
}

contract("Volatility Oracle Keeper", (accounts) => {
  let priceToken
  let underlyingToken
  let deployedMockPriceOracle
  let deployedPriceOracle
  let nextFriday8amUTC: number
  let deployedVolatilityOracle
  let deployedVolatilityKeeper
  let deployedAddressesProvider
  beforeEach(async () => {
    ;({
      deployedAddressesProvider,
      deployedPriceOracle,
      deployedMockPriceOracle,
      underlyingToken,
      priceToken,
    } = await setupAllTestContracts({}))
    // create the price oracle fresh for each test

    nextFriday8amUTC = getNextFriday8amUTCTimestamp(await now())

    const volatility = await ethers.getContractFactory("VolatilityOracle", {})

    deployedVolatilityOracle = await volatility.deploy()
    deployedVolatilityOracle.initialize(
      PERIOD,
      deployedAddressesProvider.address,
      WINDOW_IN_DAYS,
    )
    deployedAddressesProvider.setVolatilityOracle(
      deployedVolatilityOracle.address,
    )

    // We setup keeper
    deployedVolatilityKeeper = await AutomaticClaimVolKeeper.new(
      deployedAddressesProvider.address,
    )
  })

  it("checkUp and performUpkeep test", async () => {
    let topOfPeriod1 = (await getTopOfPeriod()) + PERIOD
    await time.increaseTo(topOfPeriod1)
    await deployedMockPriceOracle.setLatestAnswer(10000)
    let checkUpkeep = await deployedVolatilityKeeper.contract.methods
      .checkUpkeep("0x00")
      .call()

    assertBNEq(
      checkUpkeep.upkeepNeeded,
      false,
      "There should be nothing to upkeep",
    )

    await deployedVolatilityOracle.addTokenPair(
      underlyingToken.address,
      priceToken.address,
    )
    checkUpkeep = await deployedVolatilityKeeper.contract.methods
      .checkUpkeep("0x00")
      .call()
    assertBNEq(checkUpkeep.upkeepNeeded, true, "It should be albe to do upkeep")
    await deployedVolatilityOracle.commit(
      underlyingToken.address,
      priceToken.address,
    )

    checkUpkeep = await deployedVolatilityKeeper.contract.methods
      .checkUpkeep("0x00")
      .call()
    assertBNEq(checkUpkeep.upkeepNeeded, false, "Everything should be set")
  })
})
