import * as hre from "hardhat"

const DAY_DURATION = 24 * 60 * 60
const WEEK_DURATION = 7 * DAY_DURATION

export async function deploySingletonContracts(
  feeReceiver: string,
  gnosisAddress: string,
  dateOffset: number,
): Promise<any> {
  gnosisAddress = gnosisAddress.toLowerCase()

  const [signer] = await hre.ethers.getSigners()
  const deployerAddress = signer.address.toLowerCase()

  console.log(`deployer address is: ${deployerAddress}`)

  if (dateOffset !== WEEK_DURATION && dateOffset !== DAY_DURATION) {
    throw new Error("date offset must be either 1 week or 1 day")
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
  const AmmDataProvider = await hre.ethers.getContractFactory("AmmDataProvider")

  // each of these singleton contracts is upgradeable, and so we must deploy
  // them via a Proxy after we've deployed the logic contract
  const Proxy = await hre.ethers.getContractFactory("Proxy")

  // now deploy all the contracts. Later we will initialize them in the correct order
  const erc1155ControllerLogic = await ERC1155Controller.deploy()
  await erc1155ControllerLogic.deployed()
  const erc1155Proxy = await Proxy.deploy(erc1155ControllerLogic.address)
  await erc1155Proxy.deployed()
  console.log(
    "Logic ERC1155Controller deployed to: ",
    erc1155ControllerLogic.address.toLowerCase(),
  )
  const erc1155Controller = ERC1155Controller.attach(erc1155Proxy.address)
  console.log(
    "ERC1155Controller deployed to:       ",
    erc1155Controller.address.toLowerCase(),
  )

  const seriesVaultLogic = await SeriesVault.deploy()
  await seriesVaultLogic.deployed()
  const vaultProxy = await Proxy.deploy(seriesVaultLogic.address)
  await vaultProxy.deployed()
  console.log(
    "Logic SeriesVault deployed to:       ",
    seriesVaultLogic.address.toLowerCase(),
  )
  const seriesVault = SeriesVault.attach(vaultProxy.address)
  console.log(
    "SeriesVault deployed to:             ",
    seriesVault.address.toLowerCase(),
  )

  const seriesControllerLogic = await SeriesController.deploy()
  await seriesControllerLogic.deployed()
  const controllerProxy = await Proxy.deploy(seriesControllerLogic.address)
  await controllerProxy.deployed()
  console.log(
    "Logic SeriesController deployed to:  ",
    seriesControllerLogic.address.toLowerCase(),
  )
  const seriesController = SeriesController.attach(controllerProxy.address)
  console.log(
    "SeriesController deployed to:        ",
    seriesController.address.toLowerCase(),
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
  const ammDataProvider = await AmmDataProvider.deploy(
    seriesController.address,
    erc1155Controller.address,
    priceOracle.address,
  )
  console.log(
    "AmmDataProvider deployed to:         ",
    ammDataProvider.address.toLowerCase(),
  )

  // now deploy the logic contracts and proxy contract we'll use for the AmmFactory
  const SimpleToken = await hre.ethers.getContractFactory("SimpleToken")
  const simpleTokenLogic = await SimpleToken.deploy()
  await simpleTokenLogic.deployed()
  console.log(
    "Logic SimpleToken deployed to:       ",
    simpleTokenLogic.address.toLowerCase(),
  )
  const MinterAmm = await hre.ethers.getContractFactory("MinterAmm", {
    libraries: {
      AmmDataProvider: ammDataProvider.address,
    },
  })
  const ammLogic = await MinterAmm.deploy()
  await ammLogic.deployed()
  console.log(
    "Logic MinterAmm deployed to:         ",
    ammLogic.address.toLowerCase(),
  )

  const AmmFactory = await hre.ethers.getContractFactory("AmmFactory")
  const AmmFactoryLogic = await AmmFactory.deploy()
  const ammFactoryProxy = await Proxy.deploy(AmmFactoryLogic.address)
  await ammFactoryProxy.deployed()
  console.log(
    "Logic AmmFactory deployed to:        ",
    AmmFactoryLogic.address.toLowerCase(),
  )
  const ammFactory = AmmFactory.attach(ammFactoryProxy.address)
  console.log(
    "AmmFactory deployed to:              ",
    ammFactory.address.toLowerCase(),
  )

  const SirenExchangeFactory = await hre.ethers.getContractFactory(
    "SirenExchange",
  )

  const sirenExchange = await SirenExchangeFactory.deploy(
    erc1155Controller.address,
  )

  await sirenExchange.deployed()
  console.log(
    "SirenExchange deployed to:       ",
    sirenExchange.address.toLowerCase(),
  )

  // now that we've deployed, let's initialize them in the correct order
  await erc1155Controller.__ERC1155Controller_init(
    "https://erc1155.sirenmarkets.com/v2/{id}.json",
    seriesController.address,
  )
  console.log("initialized ERC1155Controller")

  await (await seriesVault.__SeriesVault_init(seriesController.address)).wait()
  console.log("initialized SeriesVault")

  // wait a bit for the node provider's chain state to update so the following does not fail
  await sleep(10 * 1000)

  await (
    await seriesController.__SeriesController_init(
      priceOracle.address,
      seriesVault.address,
      erc1155Controller.address,
      {
        feeReceiver: feeReceiver,
        exerciseFeeBasisPoints: 0,
        closeFeeBasisPoints: 0,
        claimFeeBasisPoints: 0,
      },
    )
  ).wait()
  console.log("initialized SeriesController")

  await (await priceOracle.initialize(dateOffset)).wait()
  console.log("initialized PriceOracle")

  await (
    await ammFactory.initialize(
      ammLogic.address,
      simpleTokenLogic.address,
      seriesController.address,
    )
  ).wait()
  console.log("initialized AmmFactory")

  console.log("initialized all contracts")

  if (gnosisAddress == deployerAddress) {
    console.log(
      "skipping transferring ownership, since the admin address is already the owner of the contracts",
    )
  } else {
    // now, we transfer ownership to the gnosis multisig
    console.log("now transferring ownership to the admin account...")
    await (await erc1155Controller.transferOwnership(gnosisAddress)).wait()
    await (await seriesVault.transferOwnership(gnosisAddress)).wait()
    await (await seriesController.transferOwnership(gnosisAddress)).wait()
    await (await priceOracle.transferOwnership(gnosisAddress)).wait()
    await (await ammFactory.transferOwnership(gnosisAddress)).wait()
    console.log(
      "finished transferring ownership of all contracts to the Gnosis Multisig Wallet",
    )
  }

  // only verify contracts if we're not on the local environment
  if (hre.network.name === "rinkeby" || hre.network.name === "mainnet") {
    // now verify all the contracts

    await verifyContract(erc1155ControllerLogic.address, "ERC1155Controller")
    await verifyContract(erc1155Controller.address, "ERC1155Controller Proxy", [
      erc1155ControllerLogic.address,
    ])

    await verifyContract(seriesVaultLogic.address, "SeriesVault")
    await verifyContract(seriesVault.address, "SeriesVault Proxy", [
      seriesVaultLogic.address,
    ])

    await verifyContract(seriesControllerLogic.address, "SeriesController")
    await verifyContract(seriesController.address, "SeriesController Proxy", [
      seriesControllerLogic.address,
    ])

    await verifyContract(priceOracleLogic.address, "PriceOracle")
    await verifyContract(priceOracle.address, "PriceOracle Proxy", [
      priceOracleLogic.address,
    ])

    await verifyContract(AmmFactoryLogic.address, "AmmFactory")
    await verifyContract(ammFactory.address, "AmmFactory Proxy", [
      AmmFactoryLogic.address,
    ])

    await verifyContract(ammLogic.address, "MinterAmm")

    await verifyContract(simpleTokenLogic.address, "SimpleToken")
  }

  return {
    erc1155Controller,
    seriesVault,
    seriesController,
    priceOracle,
    ammFactory,
    ammDataProvider,
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
