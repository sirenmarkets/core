const SimpleToken = artifacts.require("SimpleToken")
const SeriesController = artifacts.require("SeriesController")
const SeriesVault = artifacts.require("SeriesVault")
const SeriesDeployer = artifacts.require("SeriesDeployer")
const AddressesProvider = artifacts.require("AddressesProvider")
const ERC1155Controller = artifacts.require("ERC1155Controller")
const MockPriceOracle = artifacts.require("MockPriceOracle")
const MinterAmm = artifacts.require("MinterAmm")
const AmmFactory = artifacts.require("AmmFactory")
const WTokenVault = artifacts.require("WTokenVault")

// This fixture exists to replicate truffle's "migrations" setup logic
// but for hardhat
module.exports = async () => {
  const simpleToken = await SimpleToken.new()
  SimpleToken.setAsDeployed(simpleToken)

  const seriesController = await SeriesController.new()
  SeriesController.setAsDeployed(seriesController)

  const seriesVault = await SeriesVault.new()
  SeriesVault.setAsDeployed(seriesVault)

  const seriesDeployer = await SeriesDeployer.new()
  SeriesDeployer.setAsDeployed(seriesDeployer)

  const erc1155Controller = await ERC1155Controller.new()
  ERC1155Controller.setAsDeployed(erc1155Controller)

  const mockPriceOracle = await MockPriceOracle.new(8)
  MockPriceOracle.setAsDeployed(mockPriceOracle)

  const minterAmm = await MinterAmm.new()
  MinterAmm.setAsDeployed(minterAmm)

  const ammFactory = await AmmFactory.new()
  AmmFactory.setAsDeployed(ammFactory)

  const addressesProvider = await AddressesProvider.new()
  AddressesProvider.setAsDeployed(addressesProvider)

  const wTokenVault = await WTokenVault.new()
  WTokenVault.setAsDeployed(wTokenVault)
}
