import { expectEvent, expectRevert } from "@openzeppelin/test-helpers"
import { contract, artifacts } from "hardhat"
import {
  SimpleTokenInstance,
  SimpleTokenContract,
  MinterAmmInstance,
  AmmFactoryInstance,
  PriceOracleInstance,
  MinterAmmContract,
  SeriesControllerInstance,
  AmmDataProviderInstance,
  BlackScholesContract,
  AddressesProviderInstance,
} from "../../typechain"

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

let deployedAmm: MinterAmmInstance
let deployedAmmFactory: AmmFactoryInstance
let deployedPriceOracle: PriceOracleInstance
let deployedSeriesController: SeriesControllerInstance
let deployedAmmDataProvider: AmmDataProviderInstance
let deployedBlackScholes: BlackScholesContract
let deployedAddressesProvider: AddressesProviderInstance

let underlyingToken: SimpleTokenInstance
let priceToken: SimpleTokenInstance
let collateralToken: SimpleTokenInstance

const MinterAmm: MinterAmmContract = artifacts.require("MinterAmm")

import { setupAllTestContracts, setupAmm } from "../util"

/**
 * Testing the flows upgrading the AMM
 */
contract("AMM Upgradeability", (accounts) => {
  beforeEach(async () => {
    ;({
      collateralToken,
      deployedAmm,
      deployedAmmFactory,
      deployedSeriesController,
      deployedPriceOracle,
      deployedAmmDataProvider,
      underlyingToken,
      priceToken,
      collateralToken,
      deployedAddressesProvider,
    } = await setupAllTestContracts({}))
  })

  it("should fail to deploy AMM when an AMM with that token triplet has already been deployed", async () => {
    await expectRevert(
      deployedAmmFactory.createAmm(
        deployedPriceOracle.address,
        deployedAmmDataProvider.address,
        deployedBlackScholes.address,
        underlyingToken.address,
        priceToken.address,
        collateralToken.address,
      ),
      "AMM name already registered",
    )
  })

  it("Fail to upgrade from non-owner account", async () => {
    await expectRevert(
      deployedAmm.updateImplementation(deployedAmm.address, {
        from: accounts[1],
      }),
      "Ownable: caller is not the owner",
    )
  })

  it("should upgrade and be able to call function on upgraded contract", async () => {
    // create some new ERC20 tokens so we do not create an AMM with the same tokens (which would
    // cause a revert)

    const otherUnderlyingToken = await SimpleToken.new()
    await otherUnderlyingToken.initialize("Wrapped BTC", "WBTC", 8)
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

    let ret = await deployedAmm.updateImplementation(otherDeployedAmm.address)

    expectEvent(ret, "CodeAddressUpdated", {
      newAddress: otherDeployedAmm.address,
    })

    const upgradedAmm = await MinterAmm.at(otherDeployedAmm.address)

    assert.equal(
      await upgradedAmm.collateralToken(),
      otherCollateralToken.address,
    )
  })

  it("should fail to call function when upgrading to a non-MinterAmm implementation contract", async () => {
    let ret = await deployedAmm.updateImplementation(deployedAmmFactory.address)

    expectEvent(ret, "CodeAddressUpdated", {
      newAddress: deployedAmmFactory.address,
    })

    const upgradedAmm = await MinterAmm.at(deployedAmmFactory.address)

    await expectRevert(
      upgradedAmm.collateralToken(),
      "function selector was not recognized and there's no fallback function",
    )
  })

  it("Should fail to initialize twice", async () => {
    await expectRevert(
      deployedAmm.initialize(
        deployedSeriesController.address,
        deployedAmmDataProvider.address,
        deployedBlackScholes.address,
        deployedPriceOracle.address,
        underlyingToken.address,
        priceToken.address,
        collateralToken.address,
        collateralToken.address, // use arbitrary SimpleToken contract address
        0,
      ),
      "E08", // "Contract can only be initialized once"
    )
  })
})
