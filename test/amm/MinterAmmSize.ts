/* global artifacts contract it assert */
import * as hre from "hardhat"

contract("AMM Size Verification", () => {
  it("Checks size difference", async () => {
    const AmmDataProviderContractFactory = await hre.ethers.getContractFactory(
      "AmmDataProvider",
    )
    const ammDataProvider = await AmmDataProviderContractFactory.deploy()
    await ammDataProvider.deployed()

    const MinterAmmContractFactory = await hre.ethers.getContractFactory(
      "MinterAmm",
      {
        libraries: {
          AmmDataProvider: ammDataProvider.address,
        },
      },
    )
    console.log(MinterAmmContractFactory.bytecode.length / 2 / 1024)
    const ammLogic = await MinterAmmContractFactory.deploy()
    await ammLogic.deployed()
  })
})
