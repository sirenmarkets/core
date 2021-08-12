/* global artifacts contract it assert */
import { expectRevert, constants } from "@openzeppelin/test-helpers"
import { contract, assert } from "hardhat"

import { ERC1155ControllerContract } from "../../typechain"

import { setupAllTestContracts, setupSeries } from "../util"

const ERC1155Controller: ERC1155ControllerContract = artifacts.require(
  "ERC1155Controller",
)

contract("Proxy ERC1155Controller Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]

  let restrictedMinters: string[]

  beforeEach(() => {
    restrictedMinters = [aliceAccount, bobAccount]
  })

  it("Cannot initialize twice", async () => {
    const {
      deployedSeriesController,
      deployedERC1155Controller,
      erc1155URI,
    } = await setupAllTestContracts({
      restrictedMinters,
    })
    await expectRevert(
      deployedERC1155Controller.__ERC1155Controller_init(
        erc1155URI,
        deployedSeriesController.address,
      ),
      "Initializable: contract is already initialized",
    )
  })

  it("should upgrade correctly", async () => {
    const { deployedERC1155Controller } = await setupAllTestContracts({
      restrictedMinters,
    })

    const newImpl = await ERC1155Controller.new()

    // should fail to upgrade if not admin
    await expectRevert(
      deployedERC1155Controller.updateImplementation(newImpl.address, {
        from: aliceAccount,
      }),
      "ERC1155Controller: Caller is not the owner",
    )

    // now make sure it changes when we update the implementation

    const existingImplAddress = await deployedERC1155Controller.getLogicAddress()

    await deployedERC1155Controller.updateImplementation(newImpl.address)

    const newImplAddress = await deployedERC1155Controller.getLogicAddress()

    assert(existingImplAddress !== newImplAddress)
    assert(
      newImplAddress === (await deployedERC1155Controller.getLogicAddress()),
    )
  })

  it("should be able to fetch multiple option token total supplies", async () => {
    const {
      deployedSeriesController,
      deployedERC1155Controller,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration,
      deployedAmm,
      strikePrice,
      seriesId,
    } = await setupAllTestContracts({
      restrictedMinters,
    })

    const laterExpirationDate = expiration + 24 * 7 * 60 * 60

    // make a second series
    const { seriesId: anotherSeriesIndex } = await setupSeries({
      deployedSeriesController,
      underlyingToken,
      priceToken,
      collateralToken,
      expiration: laterExpirationDate,
      restrictedMinters: [deployedAmm.address],
      strikePrice: strikePrice.toString(),
      isPutOption: false,
    })

    // Approve collateral
    await underlyingToken.mint(ownerAccount, 10000)
    await underlyingToken.approve(deployedAmm.address, 10000)

    // Provide capital
    await deployedAmm.provideCapital(10000, 0)

    const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)
    const wTokenIndex = await deployedSeriesController.wTokenIndex(seriesId)
    const anotherBTokenIndex = await deployedSeriesController.bTokenIndex(
      anotherSeriesIndex,
    )
    const anotherWTokenIndex = await deployedSeriesController.wTokenIndex(
      anotherSeriesIndex,
    )

    // Now let's do some trading from another account
    await underlyingToken.mint(aliceAccount, 10000)
    await underlyingToken.approve(deployedAmm.address, 10000, {
      from: aliceAccount,
    })

    // Buy bTokens
    await deployedAmm.bTokenBuy(seriesId, 3000, 3000, {
      from: aliceAccount,
    })

    // Buy bTokens
    await deployedAmm.bTokenBuy(anotherSeriesIndex, 3000, 3000, {
      from: aliceAccount,
    })

    // now check that the bToken and wToken total supplies are non-zero, and that some
    // un-minted 5th option token is 0
    const totalSupplies = await deployedERC1155Controller.optionTokenTotalSupplyBatch(
      [
        bTokenIndex,
        wTokenIndex,
        anotherBTokenIndex,
        anotherWTokenIndex,
        anotherBTokenIndex.toNumber() + 1,
      ],
    )
    assert.notEqual(totalSupplies[0].toNumber(), 0)
    assert.notEqual(totalSupplies[1].toNumber(), 0)
    assert.notEqual(totalSupplies[2].toNumber(), 0)
    assert.notEqual(totalSupplies[3].toNumber(), 0)
    assert.equal(totalSupplies[4].toNumber(), 0)
  })

  it("should pause and unpause correctly", async () => {
    const { deployedERC1155Controller } = await setupAllTestContracts({
      restrictedMinters,
    })
    await deployedERC1155Controller.pause()

    assert(await deployedERC1155Controller.paused())

    // now unpause

    await deployedERC1155Controller.unpause()

    assert(!(await deployedERC1155Controller.paused()))
  })

  it("should transfer ownership correctly", async () => {
    const { deployedERC1155Controller } = await setupAllTestContracts({
      restrictedMinters,
    })

    // the deployer (owner) account should have pauser and admin role
    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.MINTER_ROLE(),
        ownerAccount,
      )),
    )
    assert(
      await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.PAUSER_ROLE(),
        ownerAccount,
      ),
    )
    assert(
      await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.DEFAULT_ADMIN_ROLE(),
        ownerAccount,
      ),
    )

    // and alice should have no roles
    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.MINTER_ROLE(),
        aliceAccount,
      )),
    )
    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.PAUSER_ROLE(),
        aliceAccount,
      )),
    )
    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.DEFAULT_ADMIN_ROLE(),
        aliceAccount,
      )),
    )

    await deployedERC1155Controller.transferOwnership(aliceAccount)

    // now the roles should be switched
    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.MINTER_ROLE(),
        ownerAccount,
      )),
    )
    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.PAUSER_ROLE(),
        ownerAccount,
      )),
    )
    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.DEFAULT_ADMIN_ROLE(),
        ownerAccount,
      )),
    )

    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.MINTER_ROLE(),
        aliceAccount,
      )),
    )
    assert(
      await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.PAUSER_ROLE(),
        aliceAccount,
      ),
    )
    assert(
      await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.DEFAULT_ADMIN_ROLE(),
        aliceAccount,
      ),
    )

    // now transfer it back
    await deployedERC1155Controller.transferOwnership(ownerAccount, {
      from: aliceAccount,
    })

    // check to make sure it's back to the original state prior to any of the transfers
    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.MINTER_ROLE(),
        ownerAccount,
      )),
    )
    assert(
      await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.PAUSER_ROLE(),
        ownerAccount,
      ),
    )
    assert(
      await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.DEFAULT_ADMIN_ROLE(),
        ownerAccount,
      ),
    )

    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.MINTER_ROLE(),
        aliceAccount,
      )),
    )
    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.PAUSER_ROLE(),
        aliceAccount,
      )),
    )
    assert(
      !(await deployedERC1155Controller.hasRole(
        await deployedERC1155Controller.DEFAULT_ADMIN_ROLE(),
        aliceAccount,
      )),
    )
  })
})
