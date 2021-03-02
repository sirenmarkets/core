const MockPriceOracle = artifacts.require("MockPriceOracle")
const ChainlinkEthUsdProxy = artifacts.require("ChainlinkEthUsdProxy")

contract("Chainlink ETH/USD Proxy", (accounts) => {
  before(async () => {})

  beforeEach(async () => {})

  it("Calculates price correctly", async () => {
    let ethUsdOracle = await MockPriceOracle.new(8)
    await ethUsdOracle.setLatestAnswer("176696799467")

    let sushiEthOracle = await MockPriceOracle.new(18)
    await sushiEthOracle.setLatestAnswer("9395798375082420")

    let sushiUsdOracle = await ChainlinkEthUsdProxy.new(
      ethUsdOracle.address,
      sushiEthOracle.address,
      8,
    )
    let latestRoundData = await sushiUsdOracle.latestRoundData()
    assert.equal(
      latestRoundData.answer,
      "1660207501", // 16.6e8
      "Oracle should return correct price",
    )

    assert.equal(
      await sushiUsdOracle.decimals.call(),
      8,
      "Oracle decimals should be set correctly",
    )
  })
})
