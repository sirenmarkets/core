/* global artifacts contract it assert */
import {
  time,
  expectEvent,
  expectRevert,
  BN,
  constants,
} from "@openzeppelin/test-helpers"
import { artifacts, contract, assert } from "hardhat"
import {
  MockPriceOracleContract,
  ProxyContract,
  SimpleTokenContract,
  PriceOracleContract,
  PriceOracleInstance,
  SimpleTokenInstance,
  MockPriceOracleInstance,
} from "../../typechain"

const MockPriceOracle: MockPriceOracleContract =
  artifacts.require("MockPriceOracle")
const Proxy: ProxyContract = artifacts.require("Proxy")
const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")
const PriceOracle: PriceOracleContract = artifacts.require("PriceOracle")

import {
  now,
  setupPriceOracle,
  getNextFriday8amUTCTimestamp,
  setupAllTestContracts,
  assertBNEq,
} from "../util"

const wbtcDecimals = 8
const humanCollateralPrice = new BN(22_000 * 10 ** 8) // 22k
const weekDuration = 7 * 24 * 60 * 60

contract("PriceOracle verification", (accounts) => {
  const aliceAccount = accounts[1]

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
  })

  describe("Failures", async () => {
    it("should fail to set the same token oracle twice", async () => {
      await expectRevert(
        deployedPriceOracle.addTokenPair(
          underlyingToken.address,
          priceToken.address,
          deployedMockPriceOracle.address,
        ),
        "cannot set address for an existing oracle",
      )
    })

    it("should fail if the oracle returns a 0 value when adding a token pair", async () => {
      // Create a new token so the oracle can be set
      let firstToken = await SimpleToken.new()
      await firstToken.initialize("USD Coin", "USDC", 6)

      let secondToken = await SimpleToken.new()
      await secondToken.initialize("USD Coin", "USDC", 6)

      // Set the next price to 0
      await deployedMockPriceOracle.setLatestAnswer(0)

      await expectRevert(
        deployedPriceOracle.addTokenPair(
          secondToken.address,
          firstToken.address,
          deployedMockPriceOracle.address,
        ),
        "price oracle must start with a valid price feed",
      )
    })

    it("should fail to set settlement price before setting an oracle", async () => {
      const priceOracleLogic = await PriceOracle.new()
      const proxyContract = await Proxy.new(priceOracleLogic.address)
      deployedPriceOracle = await PriceOracle.at(proxyContract.address)
      await deployedPriceOracle.initialize(weekDuration)

      await expectRevert(
        deployedPriceOracle.setSettlementPrice(
          priceToken.address,
          underlyingToken.address,
        ),
        "no oracle address for this token pair",
      )
    })

    it("should fail if the oracle returns a negative value", async () => {
      await deployedMockPriceOracle.setLatestAnswer(-1)
      await expectRevert(
        deployedPriceOracle.getCurrentPrice(
          underlyingToken.address,
          priceToken.address,
        ),
        "invalid value received from price oracle",
      )
    })

    it("should fail to update logic contract to 0 address", async () => {
      await expectRevert(
        deployedPriceOracle.updateImplementation(constants.ZERO_ADDRESS),
        "Invalid newPriceOracleImpl",
      )
    })

    it("should fail to update logic contract with non-owner", async () => {
      const priceOracleLogic = await PriceOracle.new()
      await expectRevert(
        deployedPriceOracle.updateImplementation(priceOracleLogic.address, {
          from: accounts[1],
        }),
        "Ownable: caller is not the owner",
      )
    })

    it("should fail to get current price before setting an oracle", async () => {
      const priceOracleLogic = await PriceOracle.new()
      const proxyContract = await Proxy.new(priceOracleLogic.address)
      deployedPriceOracle = await PriceOracle.at(proxyContract.address)
      await deployedPriceOracle.initialize(weekDuration)

      await expectRevert(
        deployedPriceOracle.getCurrentPrice(
          priceToken.address,
          underlyingToken.address,
        ),
        "no oracle address for this token pair",
      )
    })

    it("should fail to get settlement price before setting an oracle", async () => {
      const priceOracleLogic = await PriceOracle.new()
      const proxyContract = await Proxy.new(priceOracleLogic.address)
      deployedPriceOracle = await PriceOracle.at(proxyContract.address)
      await deployedPriceOracle.initialize(weekDuration)

      await expectRevert(
        deployedPriceOracle.getSettlementPrice(
          priceToken.address,
          underlyingToken.address,
          await now(),
        ),
        "no oracle address for this token pair",
      )
    })

    it("should fail to set a price for a specific settlement date before setting the oracle", async () => {
      const priceOracleLogic = await PriceOracle.new()
      const proxyContract = await Proxy.new(priceOracleLogic.address)
      deployedPriceOracle = await PriceOracle.at(proxyContract.address)
      await deployedPriceOracle.initialize(weekDuration)

      await expectRevert(
        deployedPriceOracle.setSettlementPriceForDate(
          priceToken.address,
          underlyingToken.address,
          nextFriday8amUTC,
          0,
        ),
        "no oracle address for this token pair",
      )
    })

    it("should fail to set a price for a specific settlement date for a non-aligned date", async () => {
      await expectRevert(
        deployedPriceOracle.setSettlementPriceForDate(
          underlyingToken.address,
          priceToken.address,
          nextFriday8amUTC - 1,
          0,
        ),
        "date is not aligned",
      )
    })

    it("should fail to set a price for a settlement date in the future", async () => {
      await expectRevert(
        deployedPriceOracle.setSettlementPriceForDate(
          underlyingToken.address,
          priceToken.address,
          nextFriday8amUTC,
          0,
        ),
        "date must be in the past",
      )
    })
  })

  describe("Successes", async () => {
    it("should set settlement price", async () => {
      const oldPriceTuple = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
      )

      assert.equal(false, oldPriceTuple[0])
      assert.equal(
        oldPriceTuple[1].toString(),
        "0",
        "price is set but shouldn't be set",
      )

      await time.increaseTo(nextFriday8amUTC) // advance to first settlement date

      // Add round to oracle
      await deployedMockPriceOracle.addRound(
        humanCollateralPrice,
        nextFriday8amUTC + 1,
        nextFriday8amUTC + 1,
      )

      const receipt = await deployedPriceOracle.setSettlementPrice(
        underlyingToken.address,
        priceToken.address,
      )

      expectEvent(receipt, "SettlementPriceSet", {
        underlyingToken: underlyingToken.address,
        priceToken: priceToken.address,
        settlementDate: nextFriday8amUTC.toString(),
        price: humanCollateralPrice,
      })

      const newPriceTuple = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
      )

      assert.equal(true, newPriceTuple[0])
      assert.equal(
        newPriceTuple[1].toString(),
        humanCollateralPrice.toString(),
        "incorrect settlement price set",
      )
    })

    it("should not change price when setting the same token + settlementDate multiple times", async () => {
      await time.increaseTo(nextFriday8amUTC) // advance to first settlement date

      // Add round to oracle
      await deployedMockPriceOracle.addRound(
        humanCollateralPrice,
        nextFriday8amUTC + 1,
        nextFriday8amUTC + 1,
      )

      await deployedPriceOracle.setSettlementPrice(
        underlyingToken.address,
        priceToken.address,
      )

      const oldPrice = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
      )

      // set a new oracle price so we'll know if it changes
      const newOraclePrice = 7_000 * 10 ** wbtcDecimals
      await deployedMockPriceOracle.setLatestAnswer(newOraclePrice)

      await deployedPriceOracle.setSettlementPrice(
        underlyingToken.address,
        priceToken.address,
      )

      const newPrice = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
      )

      assert.equal(oldPrice.toString(), newPrice.toString())
    })

    it("should be able to set the price for the same settlement date but different token", async () => {
      // setup the necessary contracts for setting another token's settlement price
      const differentDecimals = 6
      const differentToken = await SimpleToken.new()
      await differentToken.initialize("Siren Test", "SI", differentDecimals)

      const anotherMockPriceOracle = await MockPriceOracle.new(
        differentDecimals,
      )

      const differentPrice = 12_000 * 10 ** differentDecimals
      await anotherMockPriceOracle.setLatestAnswer(
        12_000 * 10 ** differentDecimals,
      )

      await deployedPriceOracle.addTokenPair(
        differentToken.address,
        priceToken.address,
        anotherMockPriceOracle.address,
      )

      // advance to shared settlement date and successfuly set the price for each token pair
      await time.increaseTo(nextFriday8amUTC)
      // Add round to oracle
      await deployedMockPriceOracle.addRound(
        humanCollateralPrice,
        nextFriday8amUTC + 1,
        nextFriday8amUTC + 1,
      )

      await deployedPriceOracle.setSettlementPrice(
        underlyingToken.address,
        priceToken.address,
      )
      let newPriceTuple = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
      )

      assert.equal(true, newPriceTuple[0])
      assert.equal(
        newPriceTuple[1].toNumber(),
        humanCollateralPrice,
        "incorrect settlement price set",
      )

      // Add round to the second oracle
      anotherMockPriceOracle.addRound(
        12_000 * 10 ** differentDecimals,
        nextFriday8amUTC + 1,
        nextFriday8amUTC + 1,
      )

      await deployedPriceOracle.setSettlementPrice(
        differentToken.address,
        priceToken.address,
      )
      newPriceTuple = await deployedPriceOracle.getSettlementPrice(
        differentToken.address,
        priceToken.address,
        nextFriday8amUTC,
      )

      assert.equal(true, newPriceTuple[0])
      assert.equal(
        newPriceTuple[1].toNumber(),
        differentPrice,
        "price should have changed to the price returned by the MockPriceOracle",
      )
    })

    it("should return isSet == false when calling getSettlementPrice for a date where the settlement price hasn't been set", async () => {
      const settlementPriceTuple = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC - 1,
      )

      assert.equal(false, settlementPriceTuple[0])

      assert.equal(0, settlementPriceTuple[1].toNumber())
    })

    it("should upgrade correctly", async () => {
      const { deployedPriceOracle } = await setupAllTestContracts()
      const newImpl = await PriceOracle.new()

      // should fail to upgrade if not admin
      await expectRevert(
        deployedPriceOracle.updateImplementation(newImpl.address, {
          from: aliceAccount,
        }),
        "Ownable: caller is not the owner",
      )

      // now make sure it changes when we update the implementation

      const existingImplAddress = await deployedPriceOracle.getLogicAddress()

      await deployedPriceOracle.updateImplementation(newImpl.address)

      const newImplAddress = await deployedPriceOracle.getLogicAddress()

      assert(existingImplAddress !== newImplAddress)
      assert(newImplAddress === (await deployedPriceOracle.getLogicAddress()))
    })

    it("should set settlement price for a specific date", async () => {
      await time.increase(weekDuration)

      // make sure the price is 0 prior to setting it
      let priceTuple = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
      )

      assert.equal(false, priceTuple[0])
      assert.equal(
        priceTuple[1].toNumber(),
        0,
        "incorrect settlement price set",
      )

      // Add round to oracle
      await deployedMockPriceOracle.addRound(
        humanCollateralPrice,
        nextFriday8amUTC + 1,
        nextFriday8amUTC + 1,
      )

      // set the price
      let receipt = await deployedPriceOracle.setSettlementPriceForDate(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
        1,
      )

      // make sure the event fired
      expectEvent(receipt, "SettlementPriceSet", {
        underlyingToken: underlyingToken.address,
        priceToken: priceToken.address,
        settlementDate: nextFriday8amUTC.toString(),
        price: humanCollateralPrice,
      })

      // make sure it got set
      priceTuple = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
      )

      assert.equal(true, priceTuple[0])
      assert.equal(
        priceTuple[1].toNumber(),
        humanCollateralPrice,
        "incorrect settlement price set",
      )

      // trying to set it again should be a no-op

      receipt = await deployedPriceOracle.setSettlementPriceForDate(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
        0,
      )

      const setSettlementEvents = receipt.logs.filter(
        (l) => l.event == "SettlementPriceSet",
      )
      assert(setSettlementEvents.length === 0)

      priceTuple = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
      )

      assert.equal(true, priceTuple[0])
      assert.equal(
        priceTuple[1].toNumber(),
        humanCollateralPrice,
        "incorrect settlement price set",
      )

      // now set the next price, to make sure we can call in multiple times

      await time.increase(weekDuration)

      // Add round to oracle
      await deployedMockPriceOracle.addRound(
        humanCollateralPrice,
        nextFriday8amUTC + weekDuration + 1,
        nextFriday8amUTC + weekDuration + 1,
      )

      // Check that trying old round returns an error
      expectRevert(
        deployedPriceOracle.setSettlementPriceForDate(
          underlyingToken.address,
          priceToken.address,
          nextFriday8amUTC + weekDuration,
          1,
        ),
        "!roundId",
      )

      // Try with correct roundId
      receipt = await deployedPriceOracle.setSettlementPriceForDate(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC + weekDuration,
        2,
      )

      // make sure the event fired
      expectEvent(receipt, "SettlementPriceSet", {
        underlyingToken: underlyingToken.address,
        priceToken: priceToken.address,
        settlementDate: (nextFriday8amUTC + weekDuration).toString(),
        price: humanCollateralPrice,
      })

      // make sure it got set
      priceTuple = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC + weekDuration,
      )

      assert.equal(true, priceTuple[0])
      assert.equal(
        priceTuple[1].toNumber(),
        humanCollateralPrice,
        "incorrect settlement price set",
      )
    })

    it("should handle non-monotonic roundId", async () => {
      await time.increaseTo(nextFriday8amUTC) // advance to first settlement date

      // Add round to oracle
      await deployedMockPriceOracle.addRoundWithId(
        1,
        humanCollateralPrice,
        nextFriday8amUTC - 1,
        nextFriday8amUTC - 1,
      )
      // Add another round with gap in roundId
      const price2 = new BN(20_000 * 10 ** 8)
      const price3 = new BN(21_000 * 10 ** 8)
      await deployedMockPriceOracle.addRoundWithId(
        3,
        price2,
        nextFriday8amUTC + 1,
        nextFriday8amUTC + 1,
      )
      await deployedMockPriceOracle.addRoundWithId(
        5,
        price3,
        nextFriday8amUTC + 10,
        nextFriday8amUTC + 10,
      )
      await deployedMockPriceOracle.addRoundWithId(
        10,
        price3,
        nextFriday8amUTC + 20,
        nextFriday8amUTC + 20,
      )

      const receipt = await deployedPriceOracle.setSettlementPrice(
        underlyingToken.address,
        priceToken.address,
      )

      expectEvent(receipt, "SettlementPriceSet", {
        underlyingToken: underlyingToken.address,
        priceToken: priceToken.address,
        settlementDate: nextFriday8amUTC.toString(),
        price: price2,
      })

      const newPriceTuple = await deployedPriceOracle.getSettlementPrice(
        underlyingToken.address,
        priceToken.address,
        nextFriday8amUTC,
      )

      assert.equal(true, newPriceTuple[0])
      assert.equal(
        newPriceTuple[1].toString(),
        price2.toString(),
        "correct settlement price set",
      )
    })

    it("should update oracle address", async () => {
      const newPrice = 123e8
      const newMockPriceOracle = await MockPriceOracle.new(wbtcDecimals)
      await newMockPriceOracle.setLatestAnswer(newPrice)

      await deployedPriceOracle.updateOracleAddress(
        underlyingToken.address,
        priceToken.address,
        newMockPriceOracle.address,
        0,
      )

      // Check that address was updated
      assertBNEq(
        await deployedPriceOracle.getCurrentPrice(
          underlyingToken.address,
          priceToken.address,
        ),
        newPrice.toString(),
        "Should return correct price from the new address",
      )

      assert(
        (await deployedPriceOracle.getPriceFeed(0)).oracle ==
          newMockPriceOracle.address,
        "New oracle address should be set",
      )
    })
  })
})
