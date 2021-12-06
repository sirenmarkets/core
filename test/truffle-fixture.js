const SimpleToken = artifacts.require("SimpleToken")
const SeriesController = artifacts.require("SeriesController")
const SeriesVault = artifacts.require("SeriesVault")
const ERC1155Controller = artifacts.require("ERC1155Controller")

const MockPriceOracle = artifacts.require("MockPriceOracle")
const MinterAmm = artifacts.require("MinterAmm")
const AmmFactory = artifacts.require("AmmFactory")
const AmmDataProvider = artifacts.require("AmmDataProvider")

import * as hre from "hardhat"

// This fixture exists to replicate truffle's "migrations" setup logic
// but for hardhat
module.exports = async () => {
  const simpleToken = await SimpleToken.new()
  SimpleToken.setAsDeployed(simpleToken)

  const seriesController = await SeriesController.new()
  SeriesController.setAsDeployed(seriesController)

  const seriesVault = await SeriesVault.new()
  SeriesVault.setAsDeployed(seriesVault)

  const erc1155Controller = await ERC1155Controller.new()
  ERC1155Controller.setAsDeployed(erc1155Controller)

  const mockPriceOracle = await MockPriceOracle.new(8)
  MockPriceOracle.setAsDeployed(mockPriceOracle)

  const ammDataProvider = await AmmDataProvider.new()
  AmmDataProvider.setAsDeployed(ammDataProvider)

  const MinterAmmContractFactory = await hre.ethers.getContractFactory(
    "MinterAmm",
    {
      libraries: {
        AmmDataProvider: ammDataProvider.address,
      },
    },
  )

  const ammLogic = await MinterAmmContractFactory.deploy()
  MinterAmm.setAsDeployed(ammLogic)

  const ammFactory = await AmmFactory.new()
  AmmFactory.setAsDeployed(ammFactory)
}
