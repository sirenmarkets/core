import { setupAllTestContracts, assertBNEq } from "../util"

import { time, expectRevert } from "@openzeppelin/test-helpers"
import { artifacts, contract, ethers } from "hardhat"
const { provider } = ethers
import { VolatilityOracleKeeperContract } from "../../typechain"

const volatilityOracleKeeper: VolatilityOracleKeeperContract =
  artifacts.require("VolatilityOracleKeeper")
const PERIOD = 86400

const WINDOW_IN_DAYS = 90 // 3 month vol data
const getNextPeriod = async () => {
  const latestTimestamp = (await provider.getBlock("latest")).timestamp
  let nextPeriod: number = latestTimestamp + PERIOD - (latestTimestamp % PERIOD)
  return nextPeriod
}

contract("Volatility Oracle Keeper", (accounts) => {
  let priceToken
  let underlyingToken
  let deployedMockPriceOracle
  let deployedVolatilityOracle
  let deployedVolatilityKeeper
  let deployedAddressesProvider
  beforeEach(async () => {
    ;({
      deployedAddressesProvider,
      deployedMockPriceOracle,
      underlyingToken,
      priceToken,
    } = await setupAllTestContracts({}))
    // create the price oracle fresh for each test
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
    deployedVolatilityKeeper = await volatilityOracleKeeper.new(
      deployedAddressesProvider.address,
    )
  })

  it("performUpkeep test", async () => {
    let nextPeriod1 = (await getNextPeriod()) + PERIOD
    await time.increaseTo(nextPeriod1)
    await deployedMockPriceOracle.setLatestAnswer(10000)
    await expectRevert(deployedVolatilityKeeper.performUpkeep("0x00"), "!work")

    await deployedVolatilityOracle.addTokenPair(
      underlyingToken.address,
      priceToken.address,
      10000,
    )
    // We simulate the transaction, but it should work
    await deployedVolatilityKeeper.contract.methods.performUpkeep("0x00").call()
    // Somebody executes it
    await deployedVolatilityOracle.commit(
      underlyingToken.address,
      priceToken.address,
    )
    // It is set by somebody else, so we have to fail
    await expectRevert(deployedVolatilityKeeper.performUpkeep("0x00"), "!work")

    // We shall test performUpkeep now
    let nextPeriod2 = (await getNextPeriod()) + PERIOD
    await time.increaseTo(nextPeriod2)
    await deployedMockPriceOracle.setLatestAnswer(1000)

    // It should work now
    await deployedVolatilityKeeper.performUpkeep("0x00")

    // For second time, it has to fail
    await expectRevert(deployedVolatilityKeeper.performUpkeep("0x00"), "!work")
  })
})
