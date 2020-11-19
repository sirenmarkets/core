const { time, expectRevert } = require("@openzeppelin/test-helpers")
const DaveyJonesLocker = artifacts.require("DaveyJonesLocker")
const SimpleToken = artifacts.require("SimpleToken")

contract("Time Locks", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]

  it("Verifies Lock", async () => {
    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize("Wrapped BTC", "WBTC", 8)

    const deployedTimeLock = await DaveyJonesLocker.new(
      collateralToken.address,
      aliceAccount,
      parseInt(currentTime) + twoDays,
    )

    await collateralToken.mint(deployedTimeLock.address, "100")

    // Verify you can't pull them out before the expiration
    await expectRevert(
      deployedTimeLock.release(),
      "TokenTimelock: current time is before release time",
    )

    // Fast forward
    await time.increase(twoDays + 1)

    // Verify the tokens are released
    await deployedTimeLock.release()

    // Verify alice has them
    assert.equal(
      await collateralToken.balanceOf.call(aliceAccount),
      100,
      "Alice should have gotten payment token",
    )
  })
})
