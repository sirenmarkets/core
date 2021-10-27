import {
  now,
  setupPriceOracle,
  getNextFriday8amUTCTimestamp,
  setupAllTestContracts,
  setupMockVolatilityPriceOracle,
} from "../util"
/* global artifacts contract it assert */
import { BigNumber } from "@ethersproject/bignumber"
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
  MockVolatilityPriceOracleInstance,
} from "../../typechain"

let deployedVolatilityOracle
let deployedMockVolatilityOracle

const MockVolatilityPriceOracle: MockVolatilityPriceOracleContract =
  artifacts.require("MockVolatilityPriceOracle")
const MockPriceOracle: MockPriceOracleContract =
  artifacts.require("MockPriceOracle")

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")
const PriceOracle: PriceOracleContract = artifacts.require("PriceOracle")

const wbtcDecimals = 8
const humanCollateralPrice = new BN(20_500 * 10 ** 8) // 20.5k
const humanCollateralPrice1 = new BN(21_500 * 10 ** 8) // 21.5k

const humanCollateralPrice2 = new BN(22_000 * 10 ** 8) // 22k

/**
 * Testing MinterAmm volatility factor updates
 */
contract("Volatility Factor", (accounts) => {
  const VolatilityOracle: VolatilityOracleContract =
    artifacts.require("VolatilityOracle")
  let deployedPriceOracle: PriceOracleInstance
  let deployedMockVolatilityPriceOracle: MockVolatilityPriceOracleInstance
  let priceToken: SimpleTokenInstance
  let underlyingToken: SimpleTokenInstance
  let deployedMockPriceOracle: MockPriceOracleInstance
  let nextFriday8amUTC: number

  let PERIOD = 86400

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

    await deployedMockPriceOracle.setLatestAnswer(humanCollateralPrice2)

    nextFriday8amUTC = getNextFriday8amUTCTimestamp(await now())
    deployedMockVolatilityPriceOracle = await setupMockVolatilityPriceOracle(
      underlyingToken.address,
      priceToken.address,
      deployedMockPriceOracle.address,
    )

    const volatility = await ethers.getContractFactory("VolatilityOracle", {})

    const MockVolatility = await ethers.getContractFactory(
      "MockVolatilityOracle",
      {},
    )

    deployedVolatilityOracle = await volatility.deploy(
      PERIOD,
      deployedMockVolatilityPriceOracle.address,
      90,
    )
    deployedMockVolatilityOracle = await MockVolatility.deploy(
      PERIOD,
      deployedMockVolatilityPriceOracle.address,
      90,
    )
  })
  describe("Successes", async () => {
    // it("Tries to Execute a BTokenBuy Exchange", async () => {
    //   const now = new Date();
    //   const year = now.getUTCFullYear();
    //   const month = now.getUTCMonth();
    //   const day = now.getUTCDate();
    //   const hour = now.getUTCHours();

    //   const todayUTC= new Date();
    //   todayUTC.setDate(day); // +1 because my logic is to get "tomorrow"
    //   todayUTC.setUTCFullYear(year);
    //   todayUTC.setMonth(month);
    //   todayUTC.setUTCHours(8);
    //   todayUTC.setUTCMinutes(0);
    //   todayUTC.setUTCSeconds(0);
    //   todayUTC.setUTCMilliseconds(0)

    //   console.log(todayUTC.getTime());

    //   let timestamp = todayUTC.getTime() - (86400000 * 2)
    //   let timestamp2 = todayUTC.getTime() - 86400000

    //   timestamp = timestamp / 1000
    //   timestamp2 = timestamp2 / 1000

    //   console.log(timestamp2);
    //   console.log(timestamp);

    //   timestamp = parseInt(
    //     await (
    //       await deployedMockVolatilityPriceOracle.get8amWeeklyOrDailyAligned(
    //         parseInt(timestamp.toString()),
    //       )
    //     ).toString(),
    //   )

    //   timestamp2 = parseInt(
    //     await (
    //       await deployedMockVolatilityPriceOracle.get8amWeeklyOrDailyAligned(
    //         parseInt(timestamp2.toString()),
    //       )
    //     ).toString(),
    //   )

    //   await deployedMockVolatilityPriceOracle.setSettlementPriceOnDate(
    //     underlyingToken.address,
    //     priceToken.address,
    //     timestamp,
    //     humanCollateralPrice
    //   )

    //   await deployedMockVolatilityPriceOracle.setSettlementPriceOnDate(
    //     underlyingToken.address,
    //     priceToken.address,
    //     timestamp2,
    //     humanCollateralPrice1
    //   )

    //   // await deployed.setSampleVariance(
    //   //   underlyingToken.address,
    //   //   priceToken.address,
    //   //   1,
    //   //   timestamp2,
    //   //   2469261,
    //   // )

    //   await deployedVolatilityOracle.updateSampleVariance(
    //     underlyingToken.address,
    //     priceToken.address
    //   )

    //   await deployedMockPriceOracle.setLatestAnswer(humanCollateralPrice2)

    //   await deployedMockVolatilityPriceOracle.setSettlementPrice(
    //     underlyingToken.address,
    //     priceToken.address,
    //   )

    //   const newPriceTuple = await deployedMockVolatilityPriceOracle.getSettlementPrice(
    //     underlyingToken.address,
    //     priceToken.address,
    //     timestamp,
    //   )
    //   // console.log(newPriceTuple)
    //   // assert.equal(true, newPriceTuple[0])
    //   // assert.equal(
    //   //   newPriceTuple[1].toString(),
    //   //   humanCollateralPrice.toString(),
    //   //   "incorrect settlement price set",
    //   // )
    //   // await deployedVolatilityOracle.updateSampleVariance(
    //   //   underlyingToken.address,
    //   //   priceToken.address
    //   // )

    //   console.log(
    //     await deployedVolatilityOracle.annualizedVol(
    //       underlyingToken.address,
    //       priceToken.address,
    //     ),
    //   )
    // })

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

      await deployedMockVolatilityOracle.initPool(
        underlyingToken.address,
        priceToken.address,
      )

      for (let i = 0; i < values.length; i++) {
        await deployedMockPriceOracle.setLatestAnswer(values[i].toString())
        await deployedMockVolatilityOracle.setPrice(values[i])
        const topOfPeriod = (await getTopOfPeriod()) + PERIOD
        await time.increaseTo(topOfPeriod)
        await deployedMockVolatilityOracle.mockCommit(
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

  const getTopOfPeriod = async () => {
    const latestTimestamp = Date.now()
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
