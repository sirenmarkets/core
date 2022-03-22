import { time, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract } from "hardhat"
import {
  SimpleTokenContract,
  PriceOracleKeeperContract,
  MockPriceOracleContract,
  MockPriceOracleInstance,
  MinterAmmInstance,
  AmmFactoryInstance,
  SeriesControllerInstance,
  PriceOracleInstance,
  AmmDataProviderInstance,
  BlackScholesInstance,
  SimpleTokenInstance,
  AddressesProviderInstance,
} from "../../typechain"

import {
  assertBNEq,
  setupAllTestContracts,
  setupAmm,
  setupSeries,
  ONE_WEEK_DURATION,
  ONE_DAY_DURATION,
  now,
} from "../util"

const STRIKE_PRICE = 20000e8 // 20000 USD
const UNDERLYING_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

const MockPriceOracle: MockPriceOracleContract =
  artifacts.require("MockPriceOracle")
const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")
const PriceOracleKeeper: PriceOracleKeeperContract =
  artifacts.require("PriceOracleKeeper")
let deployedAmm: MinterAmmInstance
let deployedAmmFactory: AmmFactoryInstance
let deployedSeriesController: SeriesControllerInstance
let deployedPriceOracle: PriceOracleInstance
let deployedAmmDataProvider: AmmDataProviderInstance
let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance
let collateralToken: SimpleTokenInstance
let deployedAddressesProvider: AddressesProviderInstance
let expiration: number
let deployedMockPriceOracle: MockPriceOracleInstance
let deployedBlackScholes: BlackScholesInstance
let seriesId1Amm1: string

/**
 * Testing Automatic Claim Keeper .
 */
contract("Automatic Claim Keeper", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]

  beforeEach(async () => {
    ;({
      deployedAmm,
      deployedAmmFactory,
      deployedSeriesController,
      deployedPriceOracle,
      deployedAmmDataProvider,
      underlyingToken,
      priceToken,
      collateralToken,
      deployedAddressesProvider,
      expiration,
      deployedMockPriceOracle,
      deployedBlackScholes,
      seriesId: seriesId1Amm1,
    } = await setupAllTestContracts({
      oraclePrice: UNDERLYING_PRICE,
      strikePrice: STRIKE_PRICE.toString(),
    }))
  })

  it("CheckUpkeep should return true even though the price is set", async () => {
    await time.increaseTo(expiration)
    await deployedMockPriceOracle.setLatestAnswer(3000)

    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    // Check that settlement price is not set before upkeep
    const result = await deployedPriceOracle.getSettlementPrice(
      underlyingToken.address,
      priceToken.address,
      expiration,
    )
    assert(result[0] == true, "settlementPrice should be set")

    const etk = await PriceOracleKeeper.new(deployedAddressesProvider.address)
    let checkUpKepp = await etk.contract.methods.checkUpkeep("0x00").call()

    assert(checkUpKepp.upkeepNeeded == true, "Still need to claim tokens")
    await deployedAmm.claimAllExpiredTokens()
    checkUpKepp = await etk.contract.methods.checkUpkeep("0x00").call()

    assert(
      checkUpKepp.upkeepNeeded == false,
      "Price should be set and expiredTokens should be claimed",
    )
  })

  it("The performUpkeep should claim the tokens even though the price is set", async () => {
    await time.increaseTo(expiration)
    await deployedMockPriceOracle.setLatestAnswer(3000)

    await deployedPriceOracle.setSettlementPrice(
      underlyingToken.address,
      priceToken.address,
    )

    // Check that settlement price is not set before upkeep
    const result = await deployedPriceOracle.getSettlementPrice(
      underlyingToken.address,
      priceToken.address,
      expiration,
    )
    assert(result[0] == true, "settlementPrice should be set")

    const etk = await PriceOracleKeeper.new(deployedAddressesProvider.address)
    let checkUpKepp = await etk.contract.methods.checkUpkeep("0x00").call()

    assert(checkUpKepp.upkeepNeeded == true, "Still need to claim tokens")
    await etk.performUpkeep("0x00")
    checkUpKepp = await etk.contract.methods.checkUpkeep("0x00").call()

    assert(
      checkUpKepp.upkeepNeeded == false,
      "Price should be set and expiredTokens should be claimed",
    )
  })

  it("Test the whole keeper for expired tokens on 2 Amms", async () => {
    //Setup second series
    const { seriesId: seriesId2Amm1 } = await setupSeries({
      deployedSeriesController,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration: expiration + 3 * ONE_WEEK_DURATION,
      restrictedMinters: [deployedAmm.address],
      strikePrice: STRIKE_PRICE.toString(),
      isPutOption: false,
    })

    const otherUnderlyingToken = await SimpleToken.new()
    await otherUnderlyingToken.initialize("Wrapped ETH", "WETH", 18)
    const otherCollateralToken = otherUnderlyingToken

    let deployedMockPriceOracle2 = await MockPriceOracle.new(18)
    deployedMockPriceOracle2.setLatestAnswer(STRIKE_PRICE)

    deployedPriceOracle.addTokenPair(
      otherUnderlyingToken.address,
      priceToken.address,
      deployedMockPriceOracle2.address,
    )

    const { deployedAmm: otherDeployedAmm } = await setupAmm({
      deployedAmmFactory,
      deployedPriceOracle,
      deployedAmmDataProvider,
      deployedBlackScholes,
      deployedAddressesProvider,
      underlyingToken: otherUnderlyingToken,
      priceToken,
      collateralToken: otherCollateralToken,
    })

    // Setup first series for second Amm
    await setupSeries({
      deployedSeriesController,
      underlyingToken: otherUnderlyingToken,
      priceToken,
      collateralToken: otherCollateralToken,
      expiration: expiration + 1 * ONE_WEEK_DURATION,
      restrictedMinters: [otherDeployedAmm.address],
      strikePrice: STRIKE_PRICE.toString(),
      isPutOption: false,
    })

    // Setup second series for second Amm
    await setupSeries({
      deployedSeriesController,
      underlyingToken: otherUnderlyingToken,
      priceToken,
      collateralToken: otherCollateralToken,
      expiration: expiration + 2 * ONE_WEEK_DURATION,
      restrictedMinters: [otherDeployedAmm.address],
      strikePrice: STRIKE_PRICE.toString(),
      isPutOption: false,
    })

    // Let us deploy our keeper
    const etk = await PriceOracleKeeper.new(deployedAddressesProvider.address)

    // test first Amm
    let series = await deployedAmm.getAllSeries()
    assertBNEq(series.length, 2, "First Amm should have 2 series")

    // test second Amm
    series = await otherDeployedAmm.getAllSeries()
    assertBNEq(series.length, 2, "Second Amm should have 2 series")

    // Nothing should have changed for both Amms
    series = await deployedAmm.getAllSeries()
    assertBNEq(
      series.length,
      2,
      "First Amm should have 2 series after first performUpkeep",
    )

    series = await otherDeployedAmm.getAllSeries()
    assertBNEq(
      series.length,
      2,
      "Second Amm should have 2 series after first performUpkeep",
    )

    // We create some bTokens simulation for first Amm
    // use the same time, no matter when this test gets called
    const initialCapital = 10000

    // We mint btokens from all series we have created for first AMM

    // Approve collateral to first AMM
    await underlyingToken.mint(ownerAccount, initialCapital)
    await underlyingToken.approve(deployedAmm.address, initialCapital)

    // Provide capital
    await deployedAmm.provideCapital(initialCapital, 0)

    // Now let's do some trading from another account
    const aliceCollateralAmount = 1000
    await underlyingToken.mint(aliceAccount, aliceCollateralAmount)
    await underlyingToken.approve(deployedAmm.address, aliceCollateralAmount, {
      from: aliceAccount,
    })

    const BUY_AMOUNT = 3000

    // Buy bTokens from first series
    await deployedAmm.bTokenBuy(seriesId1Amm1, BUY_AMOUNT, BUY_AMOUNT, {
      from: aliceAccount,
    })

    // Buy bTokens from second series
    await deployedAmm.bTokenBuy(seriesId2Amm1, BUY_AMOUNT, BUY_AMOUNT, {
      from: aliceAccount,
    })

    // We need to test performUpkeep after some series have expired
    await time.increaseTo(expiration + 3 * ONE_WEEK_DURATION - ONE_DAY_DURATION)
    await deployedMockPriceOracle.setLatestAnswer(UNDERLYING_PRICE)
    deployedMockPriceOracle2.setLatestAnswer(STRIKE_PRICE)
    // Before running performUpkeep, everything should be the same as before

    // test the first Amm
    series = await deployedAmm.getAllSeries()
    assertBNEq(series.length, 2, "First Amm should have 2 series")

    // test second Amm
    series = await otherDeployedAmm.getAllSeries()
    assertBNEq(series.length, 2, "Second Amm should have 2 series")

    let checkUpKepp = await etk.contract.methods.checkUpkeep("0x00").call()
    assertBNEq(
      checkUpKepp.upkeepNeeded,
      true,
      "upkeepNeeded should be true, because one week has passed already",
    )

    await etk.performUpkeep("0x00")
    // The state of series in amm should be following
    // In first Amm, one series should have expired
    // In second Amm, both series should have expired

    series = await deployedAmm.getAllSeries()
    assertBNEq(series.length, 1, "First Amm should have 1 series")

    series = await otherDeployedAmm.getAllSeries()
    assertBNEq(series.length, 0, "Second Amm should have 0 series")

    checkUpKepp = await etk.contract.methods.checkUpkeep("0x00").call()
    assertBNEq(checkUpKepp.upkeepNeeded, false, "upkeepNeeded should be false")
  })
})
