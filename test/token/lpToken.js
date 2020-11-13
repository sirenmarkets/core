/* global artifacts contract it assert */
const {expectRevert} = require("@openzeppelin/test-helpers")
const LPToken = artifacts.require("LPToken")
const SimpleToken = artifacts.require("SimpleToken")
const Proxy = artifacts.require("Proxy")

/**
 * LP token checks
 */
contract("LP Token Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]
  const bobAccount = accounts[2]
  const carolAccount = accounts[3]
  const daveAccount = accounts[4]
  let lpLogicContract
  let lpToken
  let dividendToken

  before(async () => {
    lpLogicContract = await LPToken.new()
  })

  beforeEach(async () => {
    // Create a dividend token to pay out to lpToken holders
    dividendToken = await SimpleToken.new()
    dividendToken.initialize("DVD", "Dividend TOKEN", 18)

    // Use a proxy for the LP token
    const proxyContract = await Proxy.new(lpLogicContract.address)
    lpToken = await LPToken.at(proxyContract.address)
  })

  it("Initializes", async () => {
    await lpToken.initialize("TST", "TEST TOKEN", 18, dividendToken.address)

    assert.equal(
      await lpToken.name.call(),
      "TST",
      "Name should be set correctly",
    )
    assert.equal(
      await lpToken.symbol.call(),
      "TEST TOKEN",
      "Symbol should be set correctly",
    )
    assert.equal(
      await lpToken.decimals.call(),
      18,
      "Decimals should be set correctly",
    )
    assert.equal(
      await lpToken.deployer.call(),
      ownerAccount,
      "The deployer account should be set",
    )

    assert.equal(
      await lpToken.distributionToken.call(),
      dividendToken.address,
      "Distribution contract address should be set",
    )
  })

  it("Mints, Transfers, TransfersFrom, and Burns", async () => {
    await lpToken.initialize("TST", "TEST TOKEN", 18, dividendToken.address)

    await lpToken.mint(aliceAccount, "1000")
    await lpToken.transfer(bobAccount, "500", {from: aliceAccount})
    await lpToken.transfer(bobAccount, "500", {from: aliceAccount})
    await lpToken.approve(carolAccount, "1000", {from: bobAccount})
    await lpToken.transferFrom(bobAccount, daveAccount, "1000", {
      from: carolAccount,
    })
    await lpToken.burn(daveAccount, "1000")
  })

  it("Pays dividends after initial sends", async () => {
    await lpToken.initialize("TST", "TEST TOKEN", 18, dividendToken.address)

    // Mint dividends and just approve it all
    await dividendToken.mint(ownerAccount, "10000")
    await dividendToken.approve(lpToken.address, "10000")

    // Check when alice owns all
    await lpToken.mint(aliceAccount, "1000")
    await lpToken.transfer(bobAccount, "250", {from: aliceAccount})
    await lpToken.transfer(carolAccount, "250", {from: aliceAccount})

    lpToken.sendDistributionFunds("100")

    // Burn tokens to get dividends send out
    await lpToken.burn(aliceAccount, "500")
    await lpToken.burn(bobAccount, "250")
    await lpToken.burn(carolAccount, "250")

    // Check dividends
    assert.equal(
      await dividendToken.balanceOf.call(aliceAccount),
      "50",
      "Alice should have gotten dividends on burn",
    )
    assert.equal(
      await dividendToken.balanceOf.call(bobAccount),
      "25",
      "Bob should have gotten dividends on burn",
    )
    assert.equal(
      await dividendToken.balanceOf.call(carolAccount),
      "25",
      "Carol should have gotten dividends on burn",
    )
  })

  it("Pays dividends with simple scenario", async () => {
    await lpToken.initialize("TST", "TEST TOKEN", 18, dividendToken.address)

    // Mint dividends and just approve it all
    await dividendToken.mint(ownerAccount, "10000")
    await dividendToken.approve(lpToken.address, "10000")

    // Check when alice owns all
    await lpToken.mint(aliceAccount, "1000")
    lpToken.sendDistributionFunds("100")

    // Send half to bob
    await lpToken.transfer(bobAccount, "500", {from: aliceAccount})
    assert.equal(
      await dividendToken.balanceOf.call(aliceAccount),
      "100",
      "Alice should have gotten all dividends on initial transfer",
    )

    // Send in more
    lpToken.sendDistributionFunds("100")

    await lpToken.burn(aliceAccount, "500")
    await lpToken.burn(bobAccount, "250")

    assert.equal(
      await dividendToken.balanceOf.call(aliceAccount),
      "150",
      "Alice should have gotten dividends on burn",
    )
    assert.equal(
      await dividendToken.balanceOf.call(bobAccount),
      "50",
      "Bob should have gotten dividends on burn",
    )
  })

  it("Pays after sending around", async () => {
    await lpToken.initialize("TST", "TEST TOKEN", 18, dividendToken.address)

    // Mint dividends and just approve it all
    await dividendToken.mint(ownerAccount, "10000")
    await dividendToken.approve(lpToken.address, "10000")

    // Check when alice owns all
    await lpToken.mint(aliceAccount, "1000")
    lpToken.sendDistributionFunds("100")

    // Send half to bob
    await lpToken.transfer(bobAccount, "500", {from: aliceAccount})
    assert.equal(
      await dividendToken.balanceOf.call(aliceAccount),
      "100",
      "Alice should have gotten all dividends on initial transfer",
    )

    // Send in more
    lpToken.sendDistributionFunds("100")

    // Have bob send half of his
    await lpToken.transfer(carolAccount, "250", {from: bobAccount})
    assert.equal(
      await dividendToken.balanceOf.call(bobAccount),
      "50",
      "Bob should have gotten half",
    )

    // Send in more
    lpToken.sendDistributionFunds("100")

    // Have carol send half to dave
    await lpToken.transfer(daveAccount, "125", {from: carolAccount})

    // Send in more
    lpToken.sendDistributionFunds("100")

    // OK we have distributed 400 tokens... burn all amounts
    await lpToken.burn(aliceAccount, "500")
    await lpToken.burn(bobAccount, "250")
    await lpToken.burn(carolAccount, "125")
    await lpToken.burn(daveAccount, "125")

    assert.equal(
      await dividendToken.balanceOf.call(aliceAccount),
      "250",
      "Alice should have gotten 100 + 50 + 50 + 50",
    )

    assert.equal(
      await dividendToken.balanceOf.call(bobAccount),
      "100",
      "Bob should have gotten 0 + 50 + 25 + 25",
    )
    // Rounding down to 12!
    assert.equal(
      await dividendToken.balanceOf.call(carolAccount),
      "37",
      "Carol should have gotten 0 + 0 + 25 + 12",
    )

    // Rounding down to 12!
    assert.equal(
      await dividendToken.balanceOf.call(daveAccount),
      "12",
      "Dave should have gotten 0 + 0 + 0 + 12",
    )
  })

  it("Pays many with 1 distribution", async () => {
    await lpToken.initialize("TST", "TEST TOKEN", 18, dividendToken.address)

    // Mint dividends and just approve it all
    await dividendToken.mint(ownerAccount, "10000")
    await dividendToken.approve(lpToken.address, "10000")

    // Check when alice owns all
    await lpToken.mint(aliceAccount, "1000")
    await lpToken.mint(bobAccount, "1000")
    await lpToken.mint(carolAccount, "1000")
    await lpToken.mint(daveAccount, "1000")
    await lpToken.mint(ownerAccount, "1000")

    lpToken.sendDistributionFunds("10000")

    await lpToken.burn(aliceAccount, "1000")
    await lpToken.burn(bobAccount, "1000")
    await lpToken.burn(carolAccount, "1000")
    await lpToken.burn(daveAccount, "1000")
    await lpToken.burn(ownerAccount, "1000")

    assert.equal(
      await dividendToken.balanceOf.call(aliceAccount),
      "2000",
      "aliceAccount should have gotten 2k",
    )
    assert.equal(
      await dividendToken.balanceOf.call(bobAccount),
      "2000",
      "bobAccount should have gotten 2k",
    )
    assert.equal(
      await dividendToken.balanceOf.call(carolAccount),
      "2000",
      "carolAccount should have gotten 2k",
    )
    assert.equal(
      await dividendToken.balanceOf.call(daveAccount),
      "2000",
      "daveAccount should have gotten 2k",
    )
    assert.equal(
      await dividendToken.balanceOf.call(ownerAccount),
      "2000",
      "ownerAccount should have gotten 2k",
    )
  })
})
