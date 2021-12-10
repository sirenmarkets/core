import { setupMockVolatilityPriceOracle } from "../../test/util"
let axios = require("axios")
import { artifacts, ethers } from "hardhat"
import { time, BN } from "@openzeppelin/test-helpers"
import { BigNumber } from "@ethersproject/bignumber"
const { provider } = ethers
import {
  MockPriceOracleContract,
  SimpleTokenContract,
  SimpleTokenInstance,
  MockVolatilityPriceOracleInstance,
} from "../../typechain"
let PERIOD = 86400
const WINDOW_IN_DAYS = 90 // 3 month vol data
const COMMIT_PHASE_DURATION = 3600 // 30 mins
let deployedMockVolatilityPriceOracle: MockVolatilityPriceOracleInstance
const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

async function getPrices() {
  const MockVolatility = await ethers.getContractFactory(
    "MockVolatilityOracle",
    {},
  )
  const MockPriceOracle: MockPriceOracleContract =
    artifacts.require("MockPriceOracle")
  let tokenList = ["ethereum"]
  for (let j = 0; j < tokenList.length; j++) {
    let token = tokenList[j]
    let url = `https://api.coingecko.com/api/v3/coins/${token}/market_chart/range?vs_currency=usd&from=${
      subtractDates(Date.now(), 90) / 1000
    }&to=${Date.now() / 1000}`
    let priceObj = await getData(url)
    let prices = priceObj.data.prices
    console.log(token)
    console.log(prices[0][1])
    let underlyingToken: SimpleTokenInstance
    let priceToken: SimpleTokenInstance
    underlyingToken = await SimpleToken.new()
    await underlyingToken.initialize(token, token, 18)
    priceToken = await SimpleToken.new()
    await priceToken.initialize("USD Coin", "USDC", 6)
    let deployedMockPriceOracle = await MockPriceOracle.new(18)
    let underlyingPrice = Math.trunc(prices[0][1] * 10 ** 10)
    console.log(underlyingPrice)
    await deployedMockPriceOracle.setLatestAnswer(underlyingPrice)
    deployedMockVolatilityPriceOracle = await setupMockVolatilityPriceOracle(
      underlyingToken.address,
      priceToken.address,
      deployedMockPriceOracle.address,
    )
    let deployedMockVolatilityOracle = await MockVolatility.deploy(
      PERIOD,
      deployedMockVolatilityPriceOracle.address,
      WINDOW_IN_DAYS,
    )
    const topOfPeriod = (await getTopOfPeriod()) + PERIOD
    await time.increaseTo(topOfPeriod)
    await deployedMockVolatilityOracle.addTokenPair(
      underlyingToken.address,
      priceToken.address,
    )
    for (let i = 0; i < prices.length; i++) {
      let price = BigNumber.from(Math.trunc(prices[i][1] * 10 ** 10).toString())
      await deployedMockPriceOracle.setLatestAnswer(price.toString())
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD
      await time.increaseTo(topOfPeriod)
      await deployedMockVolatilityOracle.commit(
        underlyingToken.address,
        priceToken.address,
      )
    }
    let stdev = await deployedMockVolatilityOracle.vol(
      underlyingToken.address,
      priceToken.address,
    )
    let annualized = await deployedMockVolatilityOracle.annualizedVol(
      underlyingToken.address,
      priceToken.address,
    )
    let accumulator = await deployedMockVolatilityOracle.accumulators(
      underlyingToken.address,
      priceToken.address,
    )
    console.log(
      "_____________________Volatility_________________________________",
    )
    console.log(underlyingToken.address)
    console.log(priceToken.address)
    console.log(token)
    console.log("annualized vol", annualized.toString())
    console.log("vol", stdev.toString())
    console.log(
      "_____________________Accumulator_________________________________",
    )
    console.log("currentObservationIndex")
    console.log(accumulator.currentObservationIndex.toString())
    console.log("lastTimestamp")
    console.log(accumulator.lastTimestamp.toString())
    console.log("mean")
    console.log(accumulator.mean.toString())
    console.log("dsq")
    console.log(accumulator.dsq.toString())
  }
  return
}

getPrices()
function subtractDates(date, days) {
  var result = new Date(date)
  result.setDate(result.getDate() - days)
  return result.getTime()
}
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
async function getData(url) {
  try {
    let data = await axios.get(url)
    return data
  } catch (err) {
    console.log(err)
  }
}
