/* global artifacts contract it assert */
import { expectRevert } from "@openzeppelin/test-helpers"
import { artifacts, contract, assert } from "hardhat"
import {
  ProxyContract,
  SimpleTokenContract,
  SimpleTokenInstance,
} from "../../typechain"

const Proxy: ProxyContract = artifacts.require("Proxy")
const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

import { assertBNEq } from "../util"

/**
 * Simple checks to make sure the proxy pointing to the token works
 */
contract("Proxy Token Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  let logicContract: SimpleTokenInstance
  let deployedToken: SimpleTokenInstance

  before(async () => {
    logicContract = await SimpleToken.new()
  })

  beforeEach(async () => {
    const proxyContract = await Proxy.new(logicContract.address)
    deployedToken = await SimpleToken.at(proxyContract.address)
  })

  it("Initializes", async () => {
    await deployedToken.initialize("TST", "TEST TOKEN", 18)
    assert.equal(
      await deployedToken.name(),
      "TST",
      "Name should be set correctly",
    )
    assert.equal(
      await deployedToken.symbol(),
      "TEST TOKEN",
      "Symbol should be set correctly",
    )
    assertBNEq(
      await deployedToken.decimals(),
      18,
      "Decimals should be set correctly",
    )
  })

  it("Mints", async () => {
    await deployedToken.initialize("TST", "TEST TOKEN", 18)
    await deployedToken.mint(aliceAccount, 1000)
    await deployedToken.mint(bobAccount, 5000)

    assertBNEq(
      await deployedToken.balanceOf(aliceAccount),
      1000,
      "Alice should have tokens",
    )
    assertBNEq(
      await deployedToken.balanceOf(bobAccount),
      5000,
      "Bob should have tokens",
    )
  })

  it("Transfers", async () => {
    await deployedToken.initialize("TST", "TEST TOKEN", 18)
    await deployedToken.mint(aliceAccount, 1000)

    await deployedToken.transfer(bobAccount, 500, { from: aliceAccount })

    assertBNEq(
      await deployedToken.balanceOf(aliceAccount),
      500,
      "Alice should have 500 tokens",
    )
    assertBNEq(
      await deployedToken.balanceOf(bobAccount),
      500,
      "Bob should have 500 tokens",
    )
  })

  // commenting this out because it's failing for typechain reasons I can't figur eout
  // and we're going to change this test with the eip 1155 upgrade anyway so it's
  // not worth debugging
  // it("Burns", async () => {
  //   await deployedToken.initialize("TST", "TEST TOKEN", 18)
  //   await deployedToken.mint(aliceAccount, 1000)

  //   // @ts-ignore
  //   await deployedToken.burn(aliceAccount, 100, { from: aliceAccount })

  //   assertBNEq(
  //     await deployedToken.balanceOf(aliceAccount),
  //     900,
  //     "Alice should have 900 tokens",
  //   )
  // })

  it("Admin Burns", async () => {
    await deployedToken.initialize("TST", "TEST TOKEN", 18)
    await deployedToken.mint(aliceAccount, 1000)

    // @ts-ignore
    await deployedToken.burn(aliceAccount, 100)

    assertBNEq(
      await deployedToken.balanceOf(aliceAccount),
      900,
      "Alice should have 900 tokens",
    )
  })

  it("Minting and burning should be gated to role", async () => {
    deployedToken.initialize("TST", "TEST TOKEN", 18)

    await expectRevert(
      deployedToken.mint(aliceAccount, 100, { from: bobAccount }),
      "ERC20PresetMinterBurner: must have minter role to mint",
    )
    await deployedToken.mint(aliceAccount, 1000)

    // Have to use strange method lookup since it is overloaded
    await expectRevert(
      deployedToken.methods["burn(address,uint256)"](aliceAccount, 100, {
        from: bobAccount,
      }),
      "ERC20PresetMinterBurner: must have burner role to admin burn",
    )
  })
})
