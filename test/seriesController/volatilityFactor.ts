import {
  now,
  setupPriceOracle,
  getNextFriday8amUTCTimestamp,
  setupAllTestContracts,
} from "../util"
/* global artifacts contract it assert */
import {
  time,
  expectEvent,
  expectRevert,
  BN,
  constants,
} from "@openzeppelin/test-helpers"
import { artifacts, contract, assert, ethers } from "hardhat"
import {
  MockPriceOracleContract,
  ProxyContract,
  SimpleTokenContract,
  PriceOracleContract,
  PriceOracleInstance,
  SimpleTokenInstance,
  MockPriceOracleInstance,
  VolatilityOracleContract,
  MockVolatilityPriceOracleContract,
} from "../../typechain"

let deployedVolatilityOracle

const MockVolatilityPriceOracle: MockVolatilityPriceOracleContract =
  artifacts.require("MockVolatilityPriceOracle")
const MockPriceOracle: MockPriceOracleContract =
  artifacts.require("MockPriceOracle")

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")
const PriceOracle: PriceOracleContract = artifacts.require("PriceOracle")

const wbtcDecimals = 8
const humanCollateralPrice = new BN(21_500 * 10 ** 8) // 22k

const humanCollateralPrice2 = new BN(22_000 * 10 ** 8) // 22k

/**
 * Testing MinterAmm volatility factor updates
 */
contract("Volatility Factor", (accounts) => {
  const VolatilityOracle: VolatilityOracleContract =
    artifacts.require("VolatilityOracle")
  let deployedPriceOracle: PriceOracleInstance
  let priceToken: SimpleTokenInstance
  let underlyingToken: SimpleTokenInstance
  let deployedMockPriceOracle: MockPriceOracleInstance
  let nextFriday8amUTC: number

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
    deployedMockPriceOracle = await MockPriceOracle.new(wbtcDecimals)
    await deployedMockPriceOracle.setLatestAnswer(humanCollateralPrice)

    nextFriday8amUTC = getNextFriday8amUTCTimestamp(await now())
    deployedPriceOracle = await setupPriceOracle(
      underlyingToken.address,
      priceToken.address,
      deployedMockPriceOracle.address,
    )

    const volatility = await ethers.getContractFactory("VolatilityOracle", {})

    deployedVolatilityOracle = await volatility.deploy(
      90,
      deployedPriceOracle.address,
    )
  })
  describe("Successes", async () => {
    it("Tries to Execute a BTokenBuy Exchange", async () => {
      let timestamp = Date.now() - 86400000

      timestamp = timestamp / 1000

      timestamp = parseInt(
        await (
          await deployedPriceOracle.get8amWeeklyOrDailyAligned(
            parseInt(timestamp.toString()),
          )
        ).toString(),
      )

      await deployedPriceOracle.setSettlementPriceForDate(
        underlyingToken.address,
        priceToken.address,
        timestamp,
      )

      await deployedMockPriceOracle.setLatestAnswer(humanCollateralPrice2)

      await deployedPriceOracle.setSettlementPrice(
        underlyingToken.address,
        priceToken.address,
      )

      const newPriceTuple = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        timestamp,
      )
      console.log(newPriceTuple)
      assert.equal(true, newPriceTuple[0])
      assert.equal(
        newPriceTuple[1].toString(),
        humanCollateralPrice.toString(),
        "incorrect settlement price set",
      )
      await deployedVolatilityOracle.setSampleVariance(
        underlyingToken.address,
        priceToken.address,
        1,
        timestamp,
        4762804,
      )
      await deployedVolatilityOracle.updateSampleVariance(
        underlyingToken.address,
        priceToken.address,
      )

      console.log(
        await deployedVolatilityOracle.annualizedVol(
          underlyingToken.address,
          priceToken.address,
        ),
      )
    })
  })
  // const ownerAccount = accounts[0]
  // const bobAccount = accounts[2]

  // let deployedAmm: MinterAmmInstance

  // beforeEach(async () => {
  //   ;({ deployedAmm } = await setupAllTestContracts({}))
  // })

  // it("Enforces Limits", async () => {
  //   // Ensure an non-owner can't edit the vol factor
  //   await expectRevert(
  //     deployedAmm.setVolatilityFactor("10000001", { from: bobAccount }),
  //     ERROR_MESSAGES.UNAUTHORIZED,
  //   )

  //   // Ensure lower bound is enforced
  //   await expectRevert(
  //     deployedAmm.setVolatilityFactor("1000", { from: ownerAccount }),
  //     "E09", // "VolatilityFactor is too low"
  //   )

  //   const newVol = new BN(1000).mul(new BN(10).pow(new BN(10)))

  //   // Set it with the owner account
  //   let ret = await deployedAmm.setVolatilityFactor(newVol, {
  //     from: ownerAccount,
  //   })
  //   expectEvent(ret, "VolatilityFactorUpdated", {
  //     newVolatilityFactor: newVol,
  //   })

  //   // Verify it got set correctly
  //   assert.equal(
  //     await deployedAmm.volatilityFactor(),
  //     newVol.toString(),
  //     "Vol factor should be set",
  //   )
  // })
})
