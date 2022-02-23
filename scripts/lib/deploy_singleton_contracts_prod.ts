import * as hre from "hardhat"
const { request, gql } = require("graphql-request")

const V2_SUBGRAPH_URL = process.env.V2_SUBGRAPH_URL
const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

export async function deploySingletonContractsProd(
  dateOffset: number,
): Promise<any> {
  const V2_CONTRACTS_QUERY = gql`
    query {
      amms {
        id
      }
      seriesControllers {
        id
        priceOracle
      }
      erc1155Controllers {
        id
      }
      seriesVaults {
        id
      }
      oracleSettings {
        priceOracleAddress
      }
    }
  `
  const {
    amms,
    seriesControllers,
    erc1155Controllers,
    seriesVaults,
    oracleSettings,
  } = await request(V2_SUBGRAPH_URL, V2_CONTRACTS_QUERY)

  // gnosisAddress = gnosisAddress.toLowerCase()

  const [signer] = await hre.ethers.getSigners()
  const deployerAddress = signer.address.toLowerCase()

  console.log(`deployer address is: ${deployerAddress}`)

  if (dateOffset !== WEEK_DURATION) {
    throw new Error("date offset must be 1 week")
  }

  // get all the contracts we'll need
  const ERC1155Controller = await hre.ethers.getContractFactory(
    "ERC1155Controller",
  )
  const SeriesVault = await hre.ethers.getContractFactory("SeriesVault")
  const SeriesController = await hre.ethers.getContractFactory(
    "SeriesController",
  )
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle")
  const VolatilityOracle = await hre.ethers.getContractFactory(
    "VolatilityOracle",
  )
  const AddressesProvider = await hre.ethers.getContractFactory(
    "AddressesProvider",
  )
  const AmmDataProvider = await hre.ethers.getContractFactory("AmmDataProvider")

  // each of these singleton contracts is upgradeable, and so we must deploy
  // them via a Proxy after we've deployed the logic contract
  const Proxy = await hre.ethers.getContractFactory("Proxy")

  // now deploy all the contracts. Later we will initialize them in the correct order
  const addressesProviderLogic = await AddressesProvider.deploy()
  await addressesProviderLogic.deployed()
  const addressesProviderProxy = await Proxy.deploy(
    addressesProviderLogic.address,
  )
  await addressesProviderProxy.deployed()
  console.log(
    "Logic AddressesProviderLogic deployed to: ",
    addressesProviderLogic.address.toLowerCase(),
  )
  const addressesProvider = AddressesProvider.attach(
    addressesProviderProxy.address,
  )
  console.log(
    "AddressesProvider deployed to:       ",
    addressesProvider.address.toLowerCase(),
  )

  // now deploy all the contracts. Later we will initialize them in the correct order

  const seriesControllerLogic = await SeriesController.deploy()
  await seriesControllerLogic.deployed()
  console.log(
    "Logic SeriesController deployed to:  ",
    seriesControllerLogic.address.toLowerCase(),
  )

  const priceOracleLogic = await PriceOracle.deploy()
  await priceOracleLogic.deployed()
  const oracleProxy = await Proxy.deploy(priceOracleLogic.address)
  await oracleProxy.deployed()
  console.log(
    "Logic PriceOracle deployed to:       ",
    priceOracleLogic.address.toLowerCase(),
  )
  const priceOracle = PriceOracle.attach(oracleProxy.address)
  console.log(
    "PriceOracle deployed to:             ",
    priceOracle.address.toLowerCase(),
  )
  // console.log(DAY_DURATION, WINDOW_SIZE)
  const volatilityOracleLogic = await VolatilityOracle.deploy()
  await volatilityOracleLogic.deployed()
  const volOracleProxy = await Proxy.deploy(volatilityOracleLogic.address)
  await volOracleProxy.deployed()
  console.log(
    "Logic VolatilityOracle deployed to:       ",
    volatilityOracleLogic.address.toLowerCase(),
  )
  const volatilityOracle = VolatilityOracle.attach(volOracleProxy.address)
  console.log(
    "VolatilityOracle deployed to:             ",
    volatilityOracle.address.toLowerCase(),
  )
  const ammDataProvider = await AmmDataProvider.deploy(
    seriesControllers[0].id,
    erc1155Controllers[0].id,
    addressesProvider.address,
  )
  console.log(
    "AmmDataProvider deployed to:         ",
    ammDataProvider.address.toLowerCase(),
  )

  // now deploy the logic contracts and proxy contract we'll use for the AmmFactory
  const MinterAmm = await hre.ethers.getContractFactory("MinterAmm")
  const ammLogic = await MinterAmm.deploy()
  await ammLogic.deployed()
  console.log(
    "Logic MinterAmm deployed to:         ",
    ammLogic.address.toLowerCase(),
  )

  const BlackScholes = await hre.ethers.getContractFactory("BlackScholes")
  const blackScholesLogic = await BlackScholes.deploy()
  await blackScholesLogic.deployed()
  console.log(
    "Logic BlackScholes deployed to:         ",
    blackScholesLogic.address.toLowerCase(),
  )

  await sleep(2000)

  const WTokenVault = await hre.ethers.getContractFactory("WTokenVault")
  const wTokenVaultLogic = await WTokenVault.deploy()

  const wTokenVaultProxy = await Proxy.deploy(wTokenVaultLogic.address)
  await wTokenVaultProxy.deployed()
  const wTokenVault = WTokenVault.attach(wTokenVaultProxy.address)
  await (await wTokenVault.initialize(addressesProvider.address)).wait()

  console.log(
    "WTokenVault deployed to:              ",
    wTokenVault.address.toLowerCase(),
  )
  await wTokenVaultLogic.deployed()
  console.log(
    "Logic WTokenVault deployed to:         ",
    wTokenVaultLogic.address.toLowerCase(),
  )

  await sleep(2000)

  const AmmFactory = await hre.ethers.getContractFactory("AmmFactory")

  const ammFactoryLogic = await AmmFactory.deploy()
  console.log(
    "Logic AmmFactory deployed to:        ",
    ammFactoryLogic.address.toLowerCase(),
  )

  const ammFactory = AmmFactory.attach(
    "0x0CdAA64b47474e02CDfbD811Ec9fd2D265cd3A0A",
  )

  const AirSwap = await hre.ethers.getContractFactory("Light")
  const airSwapLogic = AirSwap.attach(
    "0x1a62fAe49a659d29cac381C0C8Cd18C531103048",
  )

  const SirenExchangeFactory = await hre.ethers.getContractFactory(
    "SirenExchange",
  )

  const sirenExchange = await SirenExchangeFactory.deploy(
    erc1155Controllers[0].id,
  )

  await sirenExchange.deployed()
  console.log(
    "SirenExchange deployed to:       ",
    sirenExchange.address.toLowerCase(),
  )

  // seriesDeployer
  const SeriesDeployerFactory = await hre.ethers.getContractFactory(
    "SeriesDeployer",
  )

  const seriesDeployer = await SeriesDeployerFactory.deploy()

  await seriesDeployer.deployed()
  console.log(
    "SeriesDeployer deployed to:       ",
    seriesDeployer.address.toLowerCase(),
  )

  await (
    await seriesDeployer.__SeriesDeployer_init(addressesProvider.address)
  ).wait()
  console.log("initialized SeriesDeployer")

  await (await priceOracle.initialize(dateOffset)).wait()
  console.log("initialized PriceOracle")

  await (await addressesProvider.__AddressessProvider_init()).wait()

  await (
    await volatilityOracle.initialize(
      DAY_DURATION,
      addressesProvider.address,
      WINDOW_SIZE,
    )
  ).wait()
  console.log("Volatility Oracle Initialized")

  console.log("initialized all contracts")

  console.log("Set All Contracts on Addresses Provider Contract")

  await (
    await addressesProvider.setAmmDataProvider(ammDataProvider.address)
  ).wait()
  await (
    await addressesProvider.setVolatilityOracle(volatilityOracle.address)
  ).wait()
  await (await addressesProvider.setPriceOracle(priceOracle.address)).wait()
  await (
    await addressesProvider.setSeriesController(seriesControllers[0].id)
  ).wait()
  await (
    await addressesProvider.setBlackScholes(blackScholesLogic.address)
  ).wait()
  await (await addressesProvider.setAmmFactory(ammFactory.address)).wait()
  await (await addressesProvider.setAirswapLight(airSwapLogic.address)).wait()
  await (await addressesProvider.setWTokenVault(wTokenVault.address)).wait()

  // transfer ownership of implementation contracts
  // const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  // await (await ammFactoryLogic.transferOwnership(ZERO_ADDRESS)).wait()
  // await (await seriesControllerLogic.transferOwnership(ZERO_ADDRESS)).wait()
  // await (await ammLogic.transferOwnership(ZERO_ADDRESS)).wait()
  // await (await wTokenVaultLogic.transferOwnership(ZERO_ADDRESS)).wait()
  // await (await addressesProviderLogic.transferOwnership(ZERO_ADDRESS)).wait()
  // await (await priceOracleLogic.transferOwnership(ZERO_ADDRESS)).wait()
  // await (await volatilityOracleLogic.transferOwnership(ZERO_ADDRESS)).wait()
  // console.log("Logic ownership is set to ZERO_ADDRESS")

  // if (gnosisAddress k== deployerAddress) {
  //   console.log(
  //     "skipping transferring ownership, since the admin address is already the owner of the contracts",
  //   )
  // } else {
  //   // now, we transfer ownership to the gnosis multisig
  //   console.log("now transferring ownership to the admin account...")
  //   await (await addressesProvider.transferOwnership(gnosisAddress)).wait()
  //   await (await erc1155Controller.transferOwnership(gnosisAddress)).wait()
  //   await (await seriesVault.transferOwnership(gnosisAddress)).wait()
  //   await (await seriesController.transferOwnership(gnosisAddress)).wait()
  //   await (await priceOracle.transferOwnership(gnosisAddress)).wait()
  //   await (await volatilityOracle.transferOwnership(gnosisAddress)).wait()
  //   await (await ammFactory.transferOwnership(gnosisAddress)).wait()
  //   console.log(
  //     "finished transferring ownership of all contracts to the Gnosis Multisig Wallet",
  //   )
  // }

  // now verify all the contracts
  await verifyContract(addressesProviderLogic.address, "AddressesProvider")
  await verifyContract(addressesProvider.address, "AddressesProvider Proxy", [
    addressesProviderLogic.address,
  ])

  await verifyContract(wTokenVaultLogic.address, "WTokenVault")
  await verifyContract(wTokenVault.address, "WTokenVault Proxy", [
    wTokenVaultLogic.address,
  ])

  await verifyContract(sirenExchange.address, "SirenExchange")

  await verifyContract(ammDataProvider.address, "AmmDataProvider")

  await verifyContract(ammLogic.address, "MinterAmm")

  await verifyContract(seriesControllerLogic.address, "SeriesController")

  await verifyContract(priceOracleLogic.address, "PriceOracle")
  await verifyContract(priceOracle.address, "PriceOracle Proxy", [
    priceOracleLogic.address,
  ])

  await verifyContract(volatilityOracleLogic.address, "VolatilityOracle")
  await verifyContract(volatilityOracle.address, "VolatilityOracle Proxy", [
    volatilityOracleLogic.address,
  ])

  await verifyContract(ammFactoryLogic.address, "AmmFactory")

  await verifyContract(seriesDeployer.address, "SeriesDeployer")

  return {
    addressesProvider,
    priceOracle,
    ammFactory,
    ammDataProvider,
    volatilityOracle,
  }
}

const verifyContract = async (
  address,
  contractName,
  constructorArguments = [],
) => {
  await hre.run("verify:verify", {
    address,
    constructorArguments,
  })
  console.log(`verified the ${contractName}`)
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
