import seedRandom from "seedrandom"
import { expectRevert, time, BN } from "@openzeppelin/test-helpers"
import { contract } from "hardhat"
import {
  SeriesControllerInstance,
  MinterAmmInstance,
  SimpleTokenInstance,
} from "../../typechain"

let deployedAmm: MinterAmmInstance
let deployedSeriesController: SeriesControllerInstance

let collateralToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance

let expiration: number
let expirationLong: number

import {
  setupAllTestContracts,
  indexOf,
  getRandomBool,
  assertBNEq,
  ONE_WEEK_DURATION,
} from "../util"

const STRIKE_PRICE = 15000 * 1e8 // 15000 USD

contract("Minter AMM Remove expired series", (accounts) => {
  const bobAccount = accounts[2]

  beforeEach(async () => {
    ;({
      collateralToken,
      priceToken,
      deployedAmm,
      deployedSeriesController,
      expiration,
    } = await setupAllTestContracts({
      skipCreateSeries: true,
    }))

    expirationLong = expiration + ONE_WEEK_DURATION
  })

  it("Add series to amm", async () => {
    // Non-owner shouldn't be able to create a series
    await expectRevert.unspecified(
      deployedSeriesController.createSeries(
        {
          underlyingToken: collateralToken.address,
          priceToken: priceToken.address,
          collateralToken: collateralToken.address,
        },
        [STRIKE_PRICE],
        [expiration],
        [deployedAmm.address],
        false,
        { from: bobAccount },
      ),
    )

    // Create a series, which will also add this series to the amm
    const ret = await deployedSeriesController.createSeries(
      {
        underlyingToken: collateralToken.address,
        priceToken: priceToken.address,
        collateralToken: collateralToken.address,
      },
      [STRIKE_PRICE],
      [expiration],
      [deployedAmm.address],
      false,
    )

    const seriesEvent = ret.logs.find((l) => l.event == "SeriesCreated")
    // @ts-ignore
    const seriesId = seriesEvent.args.seriesId

    const series = await deployedAmm.getAllSeries()

    const is_series_added = indexOf(series, seriesId) !== -1
    assert.equal(is_series_added, true, "Series are not added to MinterAmm")

    // Non-SeriesController shouldn't be able to add a series to the AMM
    await expectRevert(deployedAmm.addSeries(seriesId), "E11")
    await expectRevert(
      deployedAmm.addSeries(seriesId, { from: bobAccount }),
      "E11",
    )
  })

  it("All series expired", async () => {
    const STRIKE_PRICE_2 = 15001 * 1e8

    let ret = await deployedSeriesController.createSeries(
      {
        underlyingToken: collateralToken.address,
        priceToken: priceToken.address,
        collateralToken: collateralToken.address,
      },
      [STRIKE_PRICE, STRIKE_PRICE_2],
      [expiration, expiration],
      [deployedAmm.address],
      false,
    )

    const openSeries = ret.logs.filter((l) => l.event == "SeriesCreated")

    assert(openSeries.length === 2)

    // @ts-ignore
    const seriesId1 = openSeries[0].args.seriesId
    // @ts-ignore
    const seriesId2 = openSeries[1].args.seriesId

    let series = await deployedAmm.getAllSeries()
    const is_series_added =
      indexOf(series, seriesId1) !== -1 && indexOf(series, seriesId2) !== -1
    assert.equal(is_series_added, true, "Series are not added to MinterAmm")

    // Move the block time to get the series expired
    await time.increaseTo(expiration + 1)

    await deployedAmm.claimAllExpiredTokens()

    series = await deployedAmm.getAllSeries()
    const is_series_removed = !(
      indexOf(series, seriesId1) !== -1 && indexOf(series, seriesId1) !== -1
    )
    assert.equal(
      is_series_removed,
      true,
      "Expired series were not removed from MinterAmm",
    )
    assert.equal(0, series.length, "The state of openseries is not correct")
  })

  it("3 open series 2 expired series", async () => {
    // 3 series will have expiry of 32 days and 2 series will have expiry of 30 days

    // Add the expirations
    await deployedSeriesController.updateAllowedExpirations([expirationLong])

    const STRIKE_PRICE_2 = 15001 * 1e8
    const STRIKE_PRICE_3 = 15002 * 1e8
    const STRIKE_PRICE_4 = 15003 * 1e8
    const STRIKE_PRICE_5 = 15003 * 1e8

    let ret = await deployedSeriesController.createSeries(
      {
        underlyingToken: collateralToken.address,
        priceToken: priceToken.address,
        collateralToken: collateralToken.address,
      },
      [
        STRIKE_PRICE,
        STRIKE_PRICE_2,
        STRIKE_PRICE_3,
        STRIKE_PRICE_4,
        STRIKE_PRICE_5,
      ],
      [expirationLong, expirationLong, expiration, expirationLong, expiration],
      [deployedAmm.address],
      false,
    )

    const openSeries = ret.logs.filter((l) => l.event == "SeriesCreated")

    assert(openSeries.length === 5)

    // @ts-ignore
    const seriesId1 = openSeries[0].args.seriesId
    // @ts-ignore
    const seriesId2 = openSeries[1].args.seriesId
    // @ts-ignore
    const seriesId3 = openSeries[2].args.seriesId
    // @ts-ignore
    const seriesId4 = openSeries[3].args.seriesId
    // @ts-ignore
    const seriesId5 = openSeries[4].args.seriesId

    let series = await deployedAmm.getAllSeries()
    const is_series_added =
      indexOf(series, seriesId1) !== -1 &&
      indexOf(series, seriesId2) !== -1 &&
      indexOf(series, seriesId3) !== -1 &&
      indexOf(series, seriesId4) !== -1 &&
      indexOf(series, seriesId5) !== -1
    assert.equal(is_series_added, true, "Series are not added to MinterAmm")

    // Move the block time to get the series3 and series5 expired
    await time.increaseTo(expiration + 1)

    await deployedAmm.claimAllExpiredTokens()

    series = await deployedAmm.getAllSeries()
    const is_open_series_not_removed =
      indexOf(series, seriesId1) !== -1 &&
      indexOf(series, seriesId2) !== -1 &&
      indexOf(series, seriesId4) !== -1
    assert.equal(
      is_open_series_not_removed,
      true,
      "Open series were removed from minterAmm",
    )

    const is_expired_series_removed = !(
      indexOf(series, seriesId3) !== -1 && indexOf(series, seriesId1) !== -1
    )
    assert.equal(
      is_expired_series_removed,
      true,
      "Expired series were not removed from MinterAmm",
    )

    assert.equal(
      true,
      series.length == 3 &&
        indexOf(series, seriesId1) == 0 &&
        indexOf(series, seriesId2) == 1 &&
        indexOf(series, seriesId4) == 2,
      `The state of openseries is not correct, actual: ${series.map((m) =>
        m.toString(),
      )}`,
    )
  })

  // // // This is the edge case where i > openSeries.length
  it("1 open & 1 series expired(last one added to the open series)", async () => {
    const STRIKE_PRICE_2 = 15001 * 1e8

    // Add the new expirations
    await deployedSeriesController.updateAllowedExpirations([expirationLong])

    let ret = await deployedSeriesController.createSeries(
      {
        underlyingToken: collateralToken.address,
        priceToken: priceToken.address,
        collateralToken: collateralToken.address,
      },
      [STRIKE_PRICE, STRIKE_PRICE_2],
      [expirationLong, expiration],
      [deployedAmm.address],
      false,
    )

    const openSeries = ret.logs.filter((l) => l.event == "SeriesCreated")

    assert(openSeries.length === 2)

    // @ts-ignore
    const seriesId1 = openSeries[0].args.seriesId
    // @ts-ignore
    const seriesId2 = openSeries[1].args.seriesId

    let series = await deployedAmm.getAllSeries()

    const is_series_added =
      indexOf(series, seriesId1) !== -1 && indexOf(series, seriesId2) !== -1
    assert.equal(is_series_added, true, "Series are not added to MinterAmm")

    // Move the block time to get the second series expired
    await time.increaseTo(expiration + 1)

    await deployedAmm.claimAllExpiredTokens()

    series = await deployedAmm.getAllSeries()

    const is_open_series_not_removed = indexOf(series, seriesId1) !== -1
    assert.equal(
      is_open_series_not_removed,
      true,
      "Open series were removed from minterAmm",
    )

    const is_expired_series_removed = indexOf(series, seriesId2) === -1
    assert.equal(
      is_expired_series_removed,
      true,
      "Expired series were not removed from MinterAmm",
    )

    assert.equal(
      true,
      series.length == 1 && indexOf(series, seriesId1) == 0,
      "The state of openseries is not correct",
    )
  })

  it("fuzz test searching through many different open/expired permutations", async () => {
    // seed the random number generator so we can re-create a test if it fails
    const seed = Math.random()
    const rng = seedRandom(seed)
    console.log(`seed: ${seed}`)

    // attempt 5 random permutations of 5 series, where some portion of them will
    // be expired and some will not. We then make sure that the call to MinterAmm.claimAllExpiredTokens
    // doesn't expire, and the number of series remaining is equal to the number of expected
    // open series

    // this is the number of permutations we'll attempt
    const PERMUTATIONS = 5

    // we'll always create this many series
    const NUM_MARKETS = 5

    for (let i = 0; i < PERMUTATIONS; i++) {
      ;({
        collateralToken,
        priceToken,
        deployedAmm,
        deployedSeriesController,
        expiration,
      } = await setupAllTestContracts({
        skipCreateSeries: true,
      }))
      expirationLong = expiration + ONE_WEEK_DURATION

      // Add the expirations
      await deployedSeriesController.updateAllowedExpirations([expirationLong])

      let numClosedSeries = 0

      const seriesExpirations = []

      for (let k = 0; k < NUM_MARKETS; k++) {
        const isClosedSeries = getRandomBool(rng)

        numClosedSeries += isClosedSeries ? 1 : 0

        const expiryDate = isClosedSeries ? expiration : expirationLong

        seriesExpirations.push(isClosedSeries ? "closed" : "open")

        const strike = STRIKE_PRICE + k * 1e8

        await deployedSeriesController.createSeries(
          {
            underlyingToken: collateralToken.address,
            priceToken: priceToken.address,
            collateralToken: collateralToken.address,
          },
          [strike],
          [expiryDate],
          [deployedAmm.address],
          false,
        )
      }

      // console.log(`${i}: ${seriesExpirations}`)

      await time.increaseTo(expiration + 1)

      await deployedAmm.claimAllExpiredTokens()

      const series = await deployedAmm.getAllSeries()

      assert.strictEqual(series.length, NUM_MARKETS - numClosedSeries)

      // all of the Series should have the expiration dates corresponding to the
      // OPEN Series
      await Promise.all(
        series.map(async (seriesId) => {
          const m = await deployedAmm.getSeries(seriesId)
          assertBNEq(expirationLong, m.expirationDate)
        }),
      )
    }
  })
})
