import {
  PriceOracleContract,
  PriceOracleInstance,
  SimpleTokenInstance,
  SimpleTokenContract,
  SeriesControllerContract,
  SeriesVaultContract,
  ERC1155ControllerContract,
  AmmDataProviderContract,
  BlackScholesContract,
  MockPriceOracleContract,
  ProxyContract,
  AmmFactoryContract,
  MinterAmmContract,
  ERC1155ControllerInstance,
  SirenExchangeContract,
  MockVolatilityPriceOracleInstance,
  MockVolatilityPriceOracleContract,
} from "../typechain"
import { artifacts, assert, ethers } from "hardhat"
import { time, expectEvent, BN } from "@openzeppelin/test-helpers"

import UniswapV2Factory from "@uniswap/v2-core/build/UniswapV2Factory.json"
import UniswapV2Router from "@uniswap/v2-periphery/build/UniswapV2Router02.json"
import IUniswapV2Pair from "@uniswap/v2-core/build/IUniswapV2Pair.json"
import { BlackScholesInstance } from "../typechain/BlackScholes"

// these are the deterministic accounts given to use by the Hardhat network. They are
// deterministic because Hardhat always uses the account mnemonic:
// "test test test test test test test test test test test junk"
const aliceAccount = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
const bobAccount = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"

const PriceOracle: PriceOracleContract = artifacts.require("PriceOracle")

const MockVolatilityPriceOracle: MockVolatilityPriceOracleContract =
  artifacts.require("MockVolatilityPriceOracle")

const SeriesController: SeriesControllerContract =
  artifacts.require("SeriesController")
const SeriesVault: SeriesVaultContract = artifacts.require("SeriesVault")
const ERC1155Controller: ERC1155ControllerContract =
  artifacts.require("ERC1155Controller")
const MockPriceOracle: MockPriceOracleContract =
  artifacts.require("MockPriceOracle")
const Proxy: ProxyContract = artifacts.require("Proxy")
const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

const AmmFactory: AmmFactoryContract = artifacts.require("AmmFactory")
const SirenExchange: SirenExchangeContract = artifacts.require("SirenExchange")
const MinterAmm: MinterAmmContract = artifacts.require("MinterAmm")
const AmmDataProvider: AmmDataProviderContract =
  artifacts.require("AmmDataProvider")

const BlackScholes: BlackScholesContract = artifacts.require("BlackScholes")

const FEE_RECEIVER_ADDRESS = "0x000000000000000000000000000000000000dEaD"
const ONE_DAY_DURATION = 24 * 60 * 60
export const ONE_WEEK_DURATION = 7 * ONE_DAY_DURATION

export async function setupPriceOracle(
  underlyingAddress: string,
  priceAddress: string,
  mockOracleAddress: string,
): Promise<PriceOracleInstance> {
  const deployedPriceOracle: PriceOracleInstance = await PriceOracle.new()

  await deployedPriceOracle.initialize(ONE_DAY_DURATION)

  await deployedPriceOracle.addTokenPair(
    underlyingAddress,
    priceAddress,
    mockOracleAddress,
  )
  return deployedPriceOracle
}

export async function setupMockVolatilityPriceOracle(
  underlyingAddress: string,
  priceAddress: string,
  mockOracleAddress: string,
): Promise<MockVolatilityPriceOracleInstance> {
  const deployedMockVolatilityPriceOracle: MockVolatilityPriceOracleInstance =
    await MockVolatilityPriceOracle.new()

  await deployedMockVolatilityPriceOracle.initialize(ONE_DAY_DURATION)

  await deployedMockVolatilityPriceOracle.addTokenPair(
    underlyingAddress,
    priceAddress,
    mockOracleAddress,
  )
  return deployedMockVolatilityPriceOracle
}

export async function checkBalances(
  deployedERC1155Controller: ERC1155ControllerInstance,
  account: string,
  accountName: string,
  collateralToken: SimpleTokenInstance,
  bTokenIndex: number | BN | string,
  wTokenIndex: number | BN | string,
  lpToken: SimpleTokenInstance,
  collateralBalance: number,
  bBalance: number,
  wBalance: number,
  lpBalance: number,
) {
  assertBNEq(
    await collateralToken.balanceOf.call(account),
    collateralBalance,
    `${accountName} should have correct collateralToken balance`,
  )

  assertBNEq(
    await deployedERC1155Controller.balanceOf.call(account, bTokenIndex),
    bBalance,
    `${accountName} should have correct bToken balance`,
  )

  assertBNEq(
    await deployedERC1155Controller.balanceOf.call(account, wTokenIndex),
    wBalance,
    `${accountName} should have correct wToken balance`,
  )

  assertBNEq(
    await lpToken.balanceOf.call(account),
    lpBalance,
    `${accountName} should have correct lpToken balance`,
  )
}

// Given a block timestamp in units of seconds, return the nearest timestamp
// in the future which is for Friday 8am UTC.
// This is used in SeriesController.createSeries, because expiration dates must
// always be aligned to Friday 8am UTC
export function getNextFriday8amUTCTimestamp(timestamp: number): number {
  const timestampMillis = timestamp * 1000
  let nextFriday8am = new Date(timestampMillis)
  nextFriday8am.setUTCHours(8, 0, 0, 0)

  // if the following is true, then it means timestamp is on a Friday
  // but sometime after 8am UTC, and so in order to get the nearest _future_
  // Friday for timestamp we must bump the day up by one (to Saturday).
  // This ensures the while loop down below will set nextFriday8am to
  // the nearest future Friday 8am
  if (new Date(timestampMillis) > nextFriday8am) {
    nextFriday8am = new Date(nextFriday8am.getTime() + ONE_DAY_DURATION * 1000)
  }

  // advance the date by 1 day until we've reached the nearest next Friday
  while (nextFriday8am.getDay() != 5) {
    nextFriday8am = new Date(nextFriday8am.getTime() + ONE_DAY_DURATION * 1000)
  }

  assert(
    nextFriday8am.getUTCDay() === 5 &&
      nextFriday8am.getUTCHours() === 8 &&
      nextFriday8am.getUTCMinutes() === 0 &&
      nextFriday8am.getUTCSeconds() === 0 &&
      nextFriday8am.getUTCMilliseconds() === 0,
  )

  return Math.floor(nextFriday8am.getTime() / 1000)
}

// helper function to simplify converting expected and actual values
// to a String for simple comparison.
// If we didn't have this function, we'd have lots of duplicated
// `assert.equal(bnPromiseExpected.toString(), actual.toString(), msg)
export function assertBNEq(
  bnPromiseExpected: string | BN | number,
  actual: number | BN | string,
  msg?: string,
) {
  const expectedString = bnPromiseExpected.toString()
  const actualString = actual.toString()

  msg = msg || `expected: ${expectedString}, actual: ${actualString}`
  assert.equal(expectedString, actualString, msg)
}

// helper function to simplify converting expected and actual values
// to a String for simple comparison with some error tolerance.
// We allow for error because some of our tests check for values that
// change according to time, and we need to account for this
export function assertBNEqWithTolerance(
  bnPromiseExpected: string | BN | number,
  actual: number | BN | string,
  tolerance: number,
  msg?: string,
) {
  const expectedNumber = parseInt(bnPromiseExpected.toString())
  const actualNumber = parseInt(actual.toString())

  msg = msg || `expected: ${expectedNumber}, actual: ${actualNumber}`
  assert.isBelow(actualNumber, expectedNumber + tolerance, msg)
  assert.isAbove(actualNumber, expectedNumber - tolerance, msg)
}

// get the number of seconds past epoch start time
export async function now(): Promise<number> {
  return Number(await time.latest())
}

export function printGasLog(opName: string, gasUsed: number): void {
  var formatted = gasUsed.toLocaleString("en-US", {
    minimumFractionDigits: 0,
  })

  console.log(`${opName}:`.padEnd(50, " "), formatted)
}

// returns a string corresponding to the series' name (e.g. WBTC.USDC.20210208.C.15000.WBTC)
export async function getSeriesName(
  underlyingToken: SimpleTokenInstance,
  priceToken: SimpleTokenInstance,
  collateralToken: SimpleTokenInstance,
  strikePrice: number,
  expirationDate: number,
  isPutOption: boolean,
): Promise<string> {
  const underlyingSymbol = await underlyingToken.symbol()
  const priceSymbol = await priceToken.symbol()
  const jsDate = new Date(expirationDate * 1000)
  const day = jsDate.getUTCDate().toString().padStart(2, "0")
  const month = (jsDate.getUTCMonth() + 1).toString().padStart(2, "0") // in JS Dates month starts at 0 (i.e. January == 0)
  const year = jsDate.getUTCFullYear()
  const optionType = isPutOption ? "P" : "C"
  const strikeStr = Math.floor(strikePrice / 1e8)
  const collateralSymbol = await collateralToken.symbol()

  return `${underlyingSymbol}.${priceSymbol}.${year}${month}${day}.${optionType}.${strikeStr}.${collateralSymbol}`
}

// helper function to search a MinterAmm's series for a particular index
export function indexOf(seriesArr, idx: number): number {
  for (let i = 0; i < seriesArr.length; i++) {
    if (seriesArr[i].toString() == idx.toString()) {
      return i
    }
  }

  return -1
}

// generate a random int 0 - max (exclusive) using the provided random number generator
export function getRandomInt(max, rng): number {
  return Math.floor(rng() * Math.floor(max))
}

// generate a true value 50% of the time, false 50% of the time
export function getRandomBool(rng): boolean {
  return rng() >= 0.5
}

// intialize the SeriesVault, ERC1155Controller, SeriesController, and AmmFactory
export async function setupSingletonTestContracts(
  {
    erc1155URI = "https://erc1155.sirenmarkets.com/v2/{id}.json",
    oraclePrice = 12_000 * 1e8, // 12k,
    feeReceiver = FEE_RECEIVER_ADDRESS,
    exerciseFee = 0,
    closeFee = 0,
    claimFee = 0,
    underlyingToken = null,
    collateralToken = null,
    priceToken = null,
  }: {
    erc1155URI?: string
    oraclePrice?: number
    feeReceiver?: string
    exerciseFee?: number
    closeFee?: number
    claimFee?: number
    underlyingToken?: SimpleTokenInstance
    collateralToken?: SimpleTokenInstance
    priceToken?: SimpleTokenInstance
  } = {
    erc1155URI: "https://erc1155.sirenmarkets.com/v2/{id}.json",
    oraclePrice: 12_000 * 1e8, // 12k,
    feeReceiver: FEE_RECEIVER_ADDRESS,
    exerciseFee: 0,
    closeFee: 0,
    claimFee: 0,
    underlyingToken: null,
    collateralToken: null,
    priceToken: null,
  },
) {
  // These logic contracts are what the proxy contracts will point to
  const seriesControllerLogic = await SeriesController.deployed()
  const seriesVaultLogic = await SeriesVault.deployed()
  const erc1155Logic = await ERC1155Controller.deployed()
  const ammFactoryLogic = await AmmFactory.deployed()
  const ammLogic = await MinterAmm.deployed()
  const erc20Logic = await SimpleToken.deployed()

  if (!underlyingToken) {
    underlyingToken = await SimpleToken.new()
    await underlyingToken.initialize("Wrapped BTC", "WBTC", 8)
  }

  if (!collateralToken) {
    collateralToken = underlyingToken
  }

  if (!priceToken) {
    priceToken = await SimpleToken.new()
    await priceToken.initialize("USD Coin", "USDC", 6)
  }

  const proxyContract = await Proxy.new(seriesControllerLogic.address)
  const deployedSeriesController = await SeriesController.at(
    proxyContract.address,
  )

  const deployedBlackScholes: BlackScholesInstance = await BlackScholes.new()

  // Create a new proxy contract pointing at the series vault logic for testing
  const vaultProxy = await Proxy.new(seriesVaultLogic.address)
  const deployedVault = await SeriesVault.at(vaultProxy.address)

  // Create a new proxy contract pointing at the series vault logic for testing
  const erc1155ControllerProxy = await Proxy.new(erc1155Logic.address)
  const deployedERC1155Controller = await ERC1155Controller.at(
    erc1155ControllerProxy.address,
  )

  // initialize the vault and erc1155 controller
  await deployedVault.__SeriesVault_init(deployedSeriesController.address)
  await deployedERC1155Controller.__ERC1155Controller_init(
    erc1155URI,
    deployedSeriesController.address,
  )

  // create mock price oracle
  const deployedMockPriceOracle = await MockPriceOracle.new(
    await underlyingToken.decimals(),
  )

  await deployedMockPriceOracle.setLatestAnswer(oraclePrice)

  // default to setting the expiration to one week after the next Friday 8am UTC date
  //
  // The reason we bump it ahead 1 week instead of simply using the next Friday is subtle:
  // All over our tests we advance the blocktime to be the exactly 1 week prior to the
  // option expiration so that our time-dependent price calculations will always result
  // in the same values. However this would result in flaky tests if we always used the
  // next Friday 8am and not the week after the next, because our tests will fail when
  // we try to "advance" to 1 week prior to the expiration and that 1 week prior is
  // actually in the past. The call to `time.increaseTo` fails if you give it a time in
  // the past.
  //
  // So the solution is to always bump the expiration day to be 1 week past the next Friday
  // and then we'll never run into this problem
  let expiration: number = getNextFriday8amUTCTimestamp(
    (await now()) + ONE_WEEK_DURATION,
  )

  const deployedPriceOracle = await setupPriceOracle(
    underlyingToken.address,
    priceToken.address,
    deployedMockPriceOracle.address,
  )

  const deployedAmmDataProvider = await AmmDataProvider.new(
    deployedSeriesController.address,
    deployedERC1155Controller.address,
    deployedPriceOracle.address,
    deployedBlackScholes.address,
  )

  const controllerInitResp =
    await deployedSeriesController.__SeriesController_init(
      deployedPriceOracle.address,
      deployedVault.address,
      deployedERC1155Controller.address,
      {
        feeReceiver: feeReceiver,
        exerciseFeeBasisPoints: exerciseFee,
        closeFeeBasisPoints: closeFee,
        claimFeeBasisPoints: claimFee,
      },
    )

  expectEvent(controllerInitResp, "SeriesControllerInitialized", {
    priceOracle: deployedPriceOracle.address,
    vault: deployedVault.address,
    erc1155Controller: deployedERC1155Controller.address,
    fees: [
      FEE_RECEIVER_ADDRESS,
      exerciseFee.toString(),
      closeFee.toString(),
      claimFee.toString(),
    ],
  })

  // deploy and initialize AmmFactory
  const ammFactoryProxy = await Proxy.new(ammFactoryLogic.address)
  const deployedAmmFactory = await AmmFactory.at(ammFactoryProxy.address)

  await deployedAmmFactory.initialize(
    ammLogic.address,
    erc20Logic.address,
    deployedSeriesController.address,
  )

  return {
    underlyingToken,
    collateralToken,
    priceToken,
    deployedVault,
    deployedERC1155Controller,
    deployedSeriesController,
    deployedPriceOracle,
    deployedMockPriceOracle,
    deployedAmmFactory,
    deployedAmmDataProvider,
    deployedBlackScholes,
    oraclePrice,
    expiration,
    exerciseFee,
    closeFee,
    claimFee,
    erc1155URI,
  }
}

export async function setUpUniswap(
  collateralToken: SimpleTokenInstance,
  deployedERC1155Controller: ERC1155ControllerInstance,
) {
  const SimpleTokenFactory = await ethers.getContractFactory("SimpleToken")

  const userToken = await SimpleTokenFactory.deploy()
  await userToken.deployed()
  await (await userToken.initialize("token A", "TKA", 8)).wait()

  const intermediateToken = await SimpleTokenFactory.deploy()
  await intermediateToken.deployed()
  await (await intermediateToken.initialize("token B", "TKB", 8)).wait()

  const weth = await SimpleTokenFactory.deploy()
  await weth.deployed()
  await (await weth.initialize("Wrapped ETH", "WETH", 18)).wait()

  const [owner] = await ethers.getSigners()

  await userToken.mint(owner.address, 10000000000 * 10)
  await intermediateToken.mint(owner.address, 10000000000 * 10)
  await collateralToken.mint(owner.address, 10000000000 * 10)

  await userToken.mint(aliceAccount, 1000000000 * 10)
  await collateralToken.mint(aliceAccount, 1000000000 * 10)

  const factory = await new ethers.ContractFactory(
    UniswapV2Factory.abi,
    UniswapV2Factory.bytecode,
    owner,
  )
  const uniSwapV2Factory = await factory.deploy(owner.address)

  const router = await new ethers.ContractFactory(
    UniswapV2Router.abi,
    UniswapV2Router.bytecode,
    owner,
  )
  const uniswapV2Router = await router.deploy(
    uniSwapV2Factory.address,
    weth.address,
  )

  await uniSwapV2Factory.createPair(
    intermediateToken.address,
    collateralToken.address,
  )
  const pairAddress = await uniSwapV2Factory.getPair(
    intermediateToken.address,
    collateralToken.address,
  )

  const pair = new ethers.Contract(
    pairAddress,
    JSON.stringify(IUniswapV2Pair.abi),
    owner,
  ).connect(owner)

  await uniSwapV2Factory.createPair(
    userToken.address,
    intermediateToken.address,
  )
  const pairAddress2 = await uniSwapV2Factory.getPair(
    userToken.address,
    intermediateToken.address,
  )
  const pair2 = new ethers.Contract(
    pairAddress2,
    JSON.stringify(IUniswapV2Pair.abi),
    owner,
  ).connect(owner)

  const token0Address = await pair.token0()
  const token0 =
    intermediateToken.address === token0Address
      ? intermediateToken
      : collateralToken
  const token1 =
    intermediateToken.address === token0Address
      ? collateralToken
      : intermediateToken

  const token1Address = await pair2.token1()
  const token2 =
    userToken.address === token1Address ? userToken : intermediateToken
  const token3 =
    userToken.address === token1Address ? intermediateToken : userToken

  var minutesToAdd = 1000000
  var currentDate = new Date()
  let deadline = new Date(currentDate.getTime() + minutesToAdd * 60000)

  await token0.approve(uniswapV2Router.address, 10000)
  await token1.approve(uniswapV2Router.address, 10000)

  await uniswapV2Router.addLiquidity(
    token0.address,
    token1.address,
    10000,
    10000,
    0,
    0,
    owner.address,
    Math.floor(deadline.getTime() / 1000),
  )

  await token2.approve(uniswapV2Router.address, 10000)
  await token3.approve(uniswapV2Router.address, 10000)

  await uniswapV2Router.addLiquidity(
    token2.address,
    token3.address,
    10000,
    10000,
    0,
    0,
    owner.address,
    Math.floor(deadline.getTime() / 1000),
  )

  const uniswapRouterPath = [
    userToken.address,
    intermediateToken.address,
    collateralToken.address,
  ]

  const deployedSirenExchange = await SirenExchange.new(
    deployedERC1155Controller.address,
  )
  const uniswapV2RouterAddress = uniswapV2Router.address

  return {
    uniswapV2RouterAddress,
    deployedSirenExchange,
    uniswapRouterPath,
  }
}

// Create a MinterAmm with the given parameters
export async function setupAmm({
  deployedAmmFactory,
  deployedPriceOracle,
  deployedAmmDataProvider,
  deployedBlackScholes,
  underlyingToken,
  priceToken,
  collateralToken,
  tradeFeeBasisPoints = 0,
}) {
  const createAmmResp = await deployedAmmFactory.createAmm(
    deployedPriceOracle.address,
    deployedAmmDataProvider.address,
    deployedBlackScholes.address,
    underlyingToken.address,
    priceToken.address,
    collateralToken.address,
    tradeFeeBasisPoints,
  )

  const ammEvent = createAmmResp.logs.find((l) => l.event == "AmmCreated")

  // @ts-ignore
  const ammAddress = ammEvent.args.amm

  const deployedAmm = await MinterAmm.at(ammAddress)

  return {
    deployedAmm,
  }
}

// Create a Series with the given parameters
export async function setupSeries({
  deployedSeriesController,
  underlyingToken,
  priceToken,
  collateralToken,
  expiration,
  restrictedMinters = [aliceAccount, bobAccount],
  isPutOption = false,
  strikePrice = (10_000e8).toString(),
}) {
  const createSeriesResp = await deployedSeriesController.createSeries(
    {
      underlyingToken: underlyingToken.address,
      priceToken: priceToken.address,
      collateralToken: collateralToken.address,
    },
    [strikePrice],
    [expiration],
    restrictedMinters,
    isPutOption,
  )

  const seriesEvent = createSeriesResp.logs.find(
    (l) => l.event == "SeriesCreated",
  )
  // @ts-ignore
  const seriesId = seriesEvent.args.seriesId

  return {
    seriesId,
    strikePrice,
    isPutOption,
    restrictedMinters,
  }
}

// Create all necessary contracts required for the Siren protocol, and also
// create a Series.
// This should be used heavily in our tests' 'beforeEach's wherever necessary
export async function setupAllTestContracts(
  {
    oraclePrice = 12_000 * 1e8, // 12k,
    feeReceiver = FEE_RECEIVER_ADDRESS,
    exerciseFee = 0,
    closeFee = 0,
    claimFee = 0,
    tradeFeeBasisPoints = 0,
    restrictedMinters = [aliceAccount, bobAccount],
    isPutOption = false,
    strikePrice = (10_000e8).toString(),
    skipCreateSeries = false,
  }: {
    oraclePrice?: number
    feeReceiver?: string
    exerciseFee?: number
    closeFee?: number
    claimFee?: number
    tradeFeeBasisPoints?: number
    restrictedMinters?: string[]
    isPutOption?: boolean
    strikePrice?: string
    skipCreateSeries?: boolean
  } = {
    oraclePrice: 12_000 * 1e8, // 12k,
    feeReceiver: FEE_RECEIVER_ADDRESS,
    exerciseFee: 0,
    closeFee: 0,
    claimFee: 0,
    tradeFeeBasisPoints: 0,
    restrictedMinters: [aliceAccount, bobAccount],
    isPutOption: false,
    strikePrice: (10_000e8).toString(),
    skipCreateSeries: false,
  },
) {
  let {
    underlyingToken,
    collateralToken,
    priceToken,
    deployedVault,
    deployedERC1155Controller,
    deployedSeriesController,
    deployedPriceOracle,
    deployedMockPriceOracle,
    deployedAmmFactory,
    deployedAmmDataProvider,
    deployedBlackScholes,
    expiration,
    erc1155URI,
  } = await setupSingletonTestContracts({
    feeReceiver,
    closeFee,
    exerciseFee,
    claimFee,
    oraclePrice,
  })

  // if the Series is to be for Puts, we need to re-assign the collateral
  // token because in setupSingletonTestContracts it assumes a Call option
  // (i.e collateralToken == underlyingToken, which is not true for Puts)
  if (isPutOption) {
    collateralToken = priceToken
  }

  const { deployedAmm } = await setupAmm({
    deployedAmmFactory,
    deployedPriceOracle,
    deployedAmmDataProvider,
    deployedBlackScholes,
    underlyingToken,
    priceToken,
    collateralToken,
    tradeFeeBasisPoints,
  })

  // TODO go through the SeriesController tests and explicitly pass in
  // "[aliceAccount, bobAccount]" for restrictedMinters so we can make
  // restrictedMinters optional in this function, and if it's not passed in
  // we simply add the deployedAmm address. This is better because it aligns
  // with how things are setup in production
  restrictedMinters.push(deployedAmm.address)

  let seriesId: string
  if (!skipCreateSeries) {
    ;({ seriesId } = await setupSeries({
      deployedSeriesController,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration,
      restrictedMinters,
      strikePrice,
      isPutOption,
    }))
  }

  return {
    underlyingToken,
    collateralToken,
    priceToken,
    deployedVault,
    deployedERC1155Controller,
    deployedSeriesController,
    deployedPriceOracle,
    deployedMockPriceOracle,
    deployedAmmFactory,
    deployedAmmDataProvider,
    deployedBlackScholes,
    deployedAmm,
    oraclePrice,
    expiration,
    seriesId,
    strikePrice,
    isPutOption,
    exerciseFee,
    closeFee,
    claimFee,
    erc1155URI,
    restrictedMinters,
  }
}
