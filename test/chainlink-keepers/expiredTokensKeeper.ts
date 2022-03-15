import { time } from "@openzeppelin/test-helpers"
import { artifacts, contract } from "hardhat"
import {
  SimpleTokenContract,
  ExpiredTokensKeeperContract,
} from "../../typechain"

import {
  assertBNEq,
  setupAllTestContracts,
  setupAmm,
  setupSeries,
  ONE_WEEK_DURATION,
  ONE_DAY_DURATION,
} from "../util"

const STRIKE_PRICE = 20000e8 // 20000 USD
const UNDERLYING_PRICE = 14_000 * 10 ** 8 // BTC oracle answer has 8 decimals places, same as BTC

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")
const ExpiredTokensKeeper: ExpiredTokensKeeperContract = artifacts.require(
  "ExpiredTokensKeeper",
)
/**
 * Testing keeper for expired tokens.
 */
contract("Expired Tokens Keeper", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]

  it("Test the whole keeper for expired tokens on 2 Amms", async () => {
    let {
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
    })

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
    const etk = await ExpiredTokensKeeper.new([
      deployedAmm.address,
      otherDeployedAmm.address,
    ])
    assertBNEq(
      await etk.getAmms(),
      [deployedAmm.address, otherDeployedAmm.address],
      "Invalid addreses in ExpiredTokensKeeper contract",
    )

    // test first Amm
    let series = await deployedAmm.getAllSeries()
    assertBNEq(series.length, 2, "First Amm should have 2 series")

    // test second Amm
    series = await otherDeployedAmm.getAllSeries()
    assertBNEq(series.length, 2, "Second Amm should have 2 series")

    let checkUpKepp = await etk.checkUpkeep("0x00")
    assertBNEq(
      checkUpKepp["0"],
      true,
      "upkeepNeeded should be true, after initialization",
    )

    await etk.performUpkeep("0x00") // first upkeep has to be done
    checkUpKepp = await etk.checkUpkeep("0x00")
    assertBNEq(
      checkUpKepp["0"],
      false,
      "upkeepNeeded should be false, after first run of performUpkeep",
    )

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
    await time.increaseTo(expiration - 1 * ONE_WEEK_DURATION)
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
    let ammReceipt = await deployedAmm.bTokenBuy(
      seriesId1Amm1,
      BUY_AMOUNT,
      BUY_AMOUNT,
      { from: aliceAccount },
    )

    // Buy bTokens from second series
    ammReceipt = await deployedAmm.bTokenBuy(
      seriesId2Amm1,
      BUY_AMOUNT,
      BUY_AMOUNT,
      {
        from: aliceAccount,
      },
    )

    // We need to test performUpkeep after some series have expired
    await time.increaseTo(expiration + 3 * ONE_WEEK_DURATION - ONE_DAY_DURATION)
    await deployedMockPriceOracle.setLatestAnswer(UNDERLYING_PRICE)
    // Before running performUpkeep, everything should be the same as before

    // test the first Amm
    series = await deployedAmm.getAllSeries()
    assertBNEq(series.length, 2, "First Amm should have 2 series")

    // test second Amm
    series = await otherDeployedAmm.getAllSeries()
    assertBNEq(series.length, 2, "Second Amm should have 2 series")

    checkUpKepp = await etk.checkUpkeep("0x00")
    assertBNEq(
      checkUpKepp["0"],
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

    checkUpKepp = await etk.checkUpkeep("0x00")
    assertBNEq(checkUpKepp["0"], false, "upkeepNeeded should be false")
  })
})
