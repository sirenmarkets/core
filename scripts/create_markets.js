const SimpleToken = artifacts.require("SimpleToken")
const MarketsRegistry = artifacts.require("MarketsRegistry")
const Market = artifacts.require("Market")
const Proxy = artifacts.require("Proxy")
const AggregatorV3Interface = artifacts.require("AggregatorV3Interface")
const MockPriceOracle = artifacts.require("MockPriceOracle")
const MinterAmm = artifacts.require("MinterAmm")

const { delay, getNetworkName } = require("./utils")
const marketSetupData = require("./market_setup_data.json")

const Ethers = require("ethers")
const BigNumber = Ethers.BigNumber

/**
 * Deploy logic contracts and initialize market registry
 * To grab the deployed instance of the registry with Truffle tooling, you can use the deployed Proxy Contract
 */
async function run() {
  const accounts = await web3.eth.getAccounts()
  const network = await getNetworkName(await web3.eth.net.getId())

  const lpAccounts = [accounts[1], accounts[2]]
  const traderAccounts = [accounts[3], accounts[4]]

  console.log(`Deploying implementation contracts`)

  const tokenImpl = await SimpleToken.deployed()
  const marketImpl = await Market.deployed()
  const marketRegistryImpl = await MarketsRegistry.deployed()
  const ammImpl = await MinterAmm.deployed()

  const WBTCToken = await SimpleToken.new()
  await WBTCToken.initialize("Wrapped BTC", "WBTC", 8)

  const USDCToken = await SimpleToken.new()
  await USDCToken.initialize("USDC Stablecoin", "USDC", 6)

  // Give tokens to LPs
  for (let i = 0; i < lpAccounts.length; i++) {
    await WBTCToken.mint(lpAccounts[i], BigNumber.from(10).pow(24).toString())
    await USDCToken.mint(lpAccounts[i], BigNumber.from(10).pow(24).toString())
  }

  // Give tokens to traders
  for (let i = 0; i < traderAccounts.length; i++) {
    await WBTCToken.mint(
      traderAccounts[i],
      BigNumber.from(10).pow(24).toString(),
    )
    await USDCToken.mint(
      traderAccounts[i],
      BigNumber.from(10).pow(24).toString(),
    )
  }

  console.log(`Setting up proxy pointing at the market registry logic`)
  const proxyContract = await Proxy.new(marketRegistryImpl.address)
  console.log(`Initializing MarketsRegistry`)
  const deployedMarketsRegistry = await MarketsRegistry.at(
    proxyContract.address,
  )

  const result = await deployedMarketsRegistry.initialize(
    tokenImpl.address,
    marketImpl.address,
    ammImpl.address,
  )

  console.log(
    `Market registry is up and running at address ${deployedMarketsRegistry.address}, initialized with tx id ${result.tx}`,
  )

  let priceOracle
  if (network == "kovan") {
    console.log("connecting to kovan oracle")
    // see https://kovan.etherscan.io/address/0x6135b13325bfC4B00278B4abC5e20bbce2D6580e
    priceOracle = await AggregatorV3Interface.at(
      "0x6135b13325bfC4B00278B4abC5e20bbce2D6580e",
    )
  } else if (network == "rinkeby") {
    console.log("connecting to rinkeby oracle")
    // https://rinkeby.etherscan.io/address/0xECe365B379E1dD183B20fc5f022230C044d51404
    priceOracle = await AggregatorV3Interface.at(
      "0xECe365B379E1dD183B20fc5f022230C044d51404",
    )
  } else if (network == "development") {
    console.log("deploying price oracle")
    priceOracle = await MockPriceOracle.deployed() // 8 decimals for WBTC's 8 decimals
    await priceOracle.setLatestAnswer(14_000 * 10 ** 8) // hardcode to $14000
    console.log("completed price oracle deploy")
  }

  // wait for 10 seconds for infura to catchup
  console.log("waiting for infura to catchup on latest deployments...")
  await delay(10 * 1000)

  console.log("deploying 2 AMMs, one for WBTC-USDC and another for USDC-WBTC")
  let ammWBTCUSDC
  let ammUSDCWBTC
  let ret = await deployedMarketsRegistry.createAmm(
    priceOracle.address,
    USDCToken.address,
    WBTCToken.address,
    0,
    false,
  )
  let ammAddress = ret.logs[2].args["0"]
  ammWBTCUSDC = await MinterAmm.at(ammAddress)

  ret = await deployedMarketsRegistry.createAmm(
    priceOracle.address,
    WBTCToken.address,
    USDCToken.address,
    0,
    true,
  )

  ammAddress = ret.logs[2].args["0"]
  ammUSDCWBTC = await MinterAmm.at(ammAddress)
  console.log("completed AMM deploy")

  // set deposit limits and whitelist LPs
  await ammWBTCUSDC.setEnforceDepositLimits(true, "70000000") // 0.7 BTC ~ $10K
  await ammUSDCWBTC.setEnforceDepositLimits(true, "10000000000") // $10K
  await ammWBTCUSDC.setCapitalDepositLimit(
    lpAccounts,
    lpAccounts.map((a) => true),
  )
  await ammUSDCWBTC.setCapitalDepositLimit(
    lpAccounts,
    lpAccounts.map((a) => true),
  )

  // call createMarket several times to setup example markets
  for (let marketData of marketSetupData) {
    let collateralToken
    let paymentToken
    let amm
    if (marketData.marketName.includes(".C.")) {
      // it's a CALL, so the collateral is WBTC
      collateralToken = WBTCToken
      paymentToken = USDCToken
      amm = ammWBTCUSDC
    } else {
      // it's a PUT, so the collateral is USDC
      collateralToken = USDCToken
      paymentToken = WBTCToken
      amm = ammUSDCWBTC
    }
    const res = await deployedMarketsRegistry.createMarket(
      marketData.marketName,
      collateralToken.address,
      paymentToken.address,
      marketData.marketStyle,
      marketData.priceRatio,
      marketData.expirationDate,
      marketData.exerciseFeeBasisPoints,
      marketData.closeFeeBasisPoints,
      marketData.claimFeeBasisPoints,
      amm.address,
    )
    console.log(
      `created market with marketName: ${marketData.marketName} with tx id: ${res.tx}`,
    )
  }

  console.log("completed deploy of 2 AMM contracts and multiple Markets")
}

module.exports = async (callback) => {
  try {
    await run()
    callback()
  } catch (e) {
    callback(e)
  }
}
