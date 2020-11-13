/* global artifacts contract it assert */
const {expectRevert} = require("@openzeppelin/test-helpers")
const SimpleToken = artifacts.require("SimpleToken")
const Proxy = artifacts.require("Proxy")

/**
 * Simple checks to make sure the proxy pointing to the token works
 */
contract("Proxy Token Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  let logicContract
  let deployedToken

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
      await deployedToken.name.call(),
      "TST",
      "Name should be set correctly",
    )
    assert.equal(
      await deployedToken.symbol.call(),
      "TEST TOKEN",
      "Symbol should be set correctly",
    )
    assert.equal(
      await deployedToken.decimals.call(),
      18,
      "Decimals should be set correctly",
    )
    assert.equal(
      await deployedToken.deployer.call(),
      ownerAccount,
      "The deployer account should be set",
    )

  })

  it("Mints", async () => {
    await deployedToken.initialize("TST", "TEST TOKEN", 18)
    await deployedToken.mint(aliceAccount, 1000)
    await deployedToken.mint(bobAccount, 5000)

    assert.equal(
      await deployedToken.balanceOf.call(aliceAccount),
      1000,
      "Alice should have tokens",
    )
    assert.equal(
      await deployedToken.balanceOf.call(bobAccount),
      5000,
      "Bob should have tokens",
    )
  })

  it("Transfers", async () => {
    await deployedToken.initialize("TST", "TEST TOKEN", 18)
    await deployedToken.mint(aliceAccount, 1000)

    await deployedToken.transfer(bobAccount, 500, {from: aliceAccount})

    assert.equal(
      await deployedToken.balanceOf.call(aliceAccount),
      500,
      "Alice should have 500 tokens",
    )
    assert.equal(
      await deployedToken.balanceOf.call(bobAccount),
      500,
      "Bob should have 500 tokens",
    )
  })

  it("Burns", async () => {
    await deployedToken.initialize("TST", "TEST TOKEN", 18)
    await deployedToken.mint(aliceAccount, 1000)

    await deployedToken.burn(100, {from: aliceAccount})

    assert.equal(
      await deployedToken.balanceOf.call(aliceAccount),
      900,
      "Alice should have 900 tokens",
    )
  })

  it("Admin Burns", async () => {
    await deployedToken.initialize("TST", "TEST TOKEN", 18)
    await deployedToken.mint(aliceAccount, 1000)

    await deployedToken.burn(aliceAccount, 100)

    assert.equal(
      await deployedToken.balanceOf.call(aliceAccount),
      900,
      "Alice should have 900 tokens",
    )
  })

  it("Minting and burning should be gated to role", async () => {
    deployedToken.initialize("TST", "TEST TOKEN", 18)

    await expectRevert(
      deployedToken.mint(aliceAccount, 100, {from: bobAccount}),
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

  it("Destroys", async () => {
    await deployedToken.initialize("TST", "TEST TOKEN", 18)

    // Verify non owner cannot destroy
    await expectRevert(
      deployedToken.selfDestructToken(bobAccount, {from: bobAccount}),
      "SimpleToken: must have admin role to destroy contract",
    )

    // Verify token can be destroyed
    await deployedToken.selfDestructToken(ownerAccount)

    // Contract should be gone
    try {
      await deployedToken.name.call()
      // Should not get here
      throw new Exception("Functions should fail to destroyed contract")
    } catch {}
  })
})
