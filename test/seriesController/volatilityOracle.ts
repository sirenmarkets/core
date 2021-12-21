import {
  now,
  getNextFriday8amUTCTimestamp,
  setupAllTestContracts,
  setupMockPriceOracle,
} from "../util"

import { time, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract, assert, ethers } from "hardhat"
import { expectRevert } from "@openzeppelin/test-helpers"
import { BigNumber } from "@ethersproject/bignumber"
const { provider } = ethers
import {
  MockPriceOracleContract,
  SimpleTokenContract,
  SimpleTokenInstance,
  MockPriceOracleInstance,
  PriceOracleInstance,
} from "../../typechain"

let deployedVolatilityOracle
let deployedMockVolatilityOracle

const MockPriceOracle: MockPriceOracleContract =
  artifacts.require("MockPriceOracle")

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

const wbtcDecimals = 8
/**
 * Testing MinterAmm volatility oracle updates
 */
contract("Volatility Oracle", (accounts) => {
  let priceToken: SimpleTokenInstance
  let underlyingToken: SimpleTokenInstance
  let deployedMockPriceOracle
  let nextFriday8amUTC: number
  let deployedPriceOracle

  let PERIOD = 8640
  const WINDOW_IN_DAYS = 90 // 3 month vol data
  const COMMIT_PHASE_DURATION = 3600 // 30 mins

  before(async () => {
    // Create a token for the underlying asset
    underlyingToken = await SimpleToken.new()
    await underlyingToken.initialize("Wrapped BTC", "WBTC", wbtcDecimals)

    // Create a token for the price asset, this is the asset the underlying is priced in
    priceToken = await SimpleToken.new()
    await priceToken.initialize("USD Coin", "USDC", 6)
  })

  beforeEach(async () => {
    // create the price oracle fresh for each test

    deployedPriceOracle = await MockPriceOracle.new(wbtcDecimals)
    const humanCollateralPrice2 = new BN(22_000 * 10 ** 8) // 22k

    await deployedPriceOracle.setLatestAnswer(humanCollateralPrice2)

    deployedMockPriceOracle = await setupMockPriceOracle(
      underlyingToken.address,
      priceToken.address,
      deployedPriceOracle.address,
    )

    nextFriday8amUTC = getNextFriday8amUTCTimestamp(await now())

    const volatility = await ethers.getContractFactory("VolatilityOracle", {})

    const MockVolatility = await ethers.getContractFactory(
      "MockVolatilityOracle",
      {},
    )

    deployedVolatilityOracle = await volatility.deploy(
      PERIOD,
      deployedMockPriceOracle.address,
      WINDOW_IN_DAYS,
    )
    deployedMockVolatilityOracle = await MockVolatility.deploy(
      PERIOD,
      deployedMockPriceOracle.address,
      WINDOW_IN_DAYS,
    )
  })

  describe("initPool", () => {
    it("initializes pool", async function () {
      await expectRevert(
        deployedVolatilityOracle.commit(
          underlyingToken.address,
          priceToken.address,
        ),
        "!pool initialize",
      )

      await deployedVolatilityOracle.addTokenPair(
        underlyingToken.address,
        priceToken.address,
      )
    })

    it("reverts when pool has already been initialized", async function () {
      await deployedVolatilityOracle.addTokenPair(
        underlyingToken.address,
        priceToken.address,
      )
      await expectRevert(
        deployedVolatilityOracle.addTokenPair(
          underlyingToken.address,
          priceToken.address,
        ),
        "Pool initialized",
      )
    })
  })

  describe("Updates the vol", async () => {
    it("updates the vol", async function () {
      const values = [
        BigNumber.from("2000000000"),
        BigNumber.from("2100000000"),
        BigNumber.from("2200000000"),
        BigNumber.from("2150000000"),
      ]
      const stdevs = [
        BigNumber.from("0"),
        BigNumber.from("2439508"),
        BigNumber.from("2248393"),
        BigNumber.from("3068199"),
      ]

      const topOfPeriod = (await getTopOfPeriod()) + PERIOD
      await time.increaseTo(topOfPeriod)

      await deployedMockVolatilityOracle.addTokenPair(
        underlyingToken.address,
        priceToken.address,
      )

      for (let i = 0; i < values.length; i++) {
        await deployedPriceOracle.setLatestAnswer(values[i].toString())
        await deployedMockVolatilityOracle.setPrice(values[i])
        const topOfPeriod = (await getTopOfPeriod()) + PERIOD
        await time.increaseTo(topOfPeriod)
        await deployedMockVolatilityOracle.commit(
          underlyingToken.address,
          priceToken.address,
        )
        let stdev = await deployedMockVolatilityOracle.vol(
          underlyingToken.address,
          priceToken.address,
        )
        assert.equal(stdev.toString(), stdevs[i].toString())
      }
    })
  })

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
})
