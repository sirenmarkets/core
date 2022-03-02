/* global artifacts contract it assert */
import { artifacts, contract } from "hardhat"
import { expectRevert } from "@openzeppelin/test-helpers"
import {
  MockPriceOracleContract,
  MockPriceOracleInstance,
  ChainlinkEthUsdProxyContract,
  ChainlinkEthUsdProxyInstance,
} from "../../typechain"

import { assertBNEq } from "../util"

const MockPriceOracle: MockPriceOracleContract =
  artifacts.require("MockPriceOracle")
const ChainlinkEthUsdProxy: ChainlinkEthUsdProxyContract = artifacts.require(
  "ChainlinkEthUsdProxy",
)

contract("Chainlink ETH/USD Proxy", () => {
  before(async () => {})

  beforeEach(async () => {})

  it("is deprecated", async () => {
    let ethUsdOracle: MockPriceOracleInstance = await MockPriceOracle.new(8)
    await ethUsdOracle.setLatestAnswer("176696799467")

    let sushiEthOracle: MockPriceOracleInstance = await MockPriceOracle.new(18)
    await sushiEthOracle.setLatestAnswer("9395798375082420")

    let sushiUsdOracle: ChainlinkEthUsdProxyInstance =
      await ChainlinkEthUsdProxy.new(
        ethUsdOracle.address,
        sushiEthOracle.address,
        8,
      )

    expectRevert(sushiUsdOracle.latestRoundData(), "Method not implemented")
  })

  xit("Calculates price correctly", async () => {
    let ethUsdOracle: MockPriceOracleInstance = await MockPriceOracle.new(8)
    await ethUsdOracle.setLatestAnswer("176696799467")

    let sushiEthOracle: MockPriceOracleInstance = await MockPriceOracle.new(18)
    await sushiEthOracle.setLatestAnswer("9395798375082420")

    let sushiUsdOracle: ChainlinkEthUsdProxyInstance =
      await ChainlinkEthUsdProxy.new(
        ethUsdOracle.address,
        sushiEthOracle.address,
        8,
      )
    let latestRoundData = await sushiUsdOracle.latestRoundData()
    assertBNEq(
      latestRoundData[1],
      "1660207501", // 16.6e8
      "Oracle should return correct price",
    )

    assertBNEq(
      await sushiUsdOracle.decimals(),
      8,
      "Oracle decimals should be set correctly",
    )
  })
})
