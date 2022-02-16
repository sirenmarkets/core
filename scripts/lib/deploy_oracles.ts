import * as hre from "hardhat"
const { request, gql } = require("graphql-request")

const ADDRESSES_PROVIDER = process.env.ADDRESSES_PROVIDER
const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

export async function deployOracles(
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

  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle")
  const VolatilityOracle = await hre.ethers.getContractFactory(
    "VolatilityOracle",
  )

  // each of these singleton contracts is upgradeable, and so we must deploy
  // them via a Proxy after we've deployed the logic contract
  const Proxy = await hre.ethers.getContractFactory("Proxy")

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
  console.log(DAY_DURATION, WINDOW_SIZE)
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

  await (await priceOracle.initialize(dateOffset)).wait()
  console.log("initialized PriceOracle")

  await await volatilityOracle.initialize(
    DAY_DURATION,
    ADDRESSES_PROVIDER,
    WINDOW_SIZE,
  )
  console.log("Volatility Oracle Initialized")

  console.log("initialized all contracts")

  // only verify contracts if we're not on the local environment
  if (
    hre.network.name === "rinkeby" ||
    hre.network.name === "mainnet" ||
    hre.network.name == "mumbai"
  ) {
    try {
      // now verify all the contracts
      await verifyContract(priceOracleLogic.address, "PriceOracle")
      await verifyContract(priceOracle.address, "PriceOracle Proxy", [
        priceOracleLogic.address,
      ])

      await verifyContract(volatilityOracleLogic.address, "VolatilityOracle")
      await verifyContract(volatilityOracle.address, "volatilityOracle Proxy", [
        volatilityOracleLogic.address,
      ])
    } catch (err) {
      console.log(err)
    }
  }

  console.log("Set up all Oracles")

  let tokenPairs = [
    {
      underlyingToken: "0xda537104d6a5edd53c6fbba9a898708e465260b6",
      chainLink: "0xecbff2ee735bee23c17652ae4e1f76c30a69b247",
      currentObservationIndex: 89,
      lastTimeStamp: 1644912300,
      mean: -272916,
      dsq: 4132959718143459,
      name: "YFI",
    },
    {
      underlyingToken: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
      chainLink: "0xab594600376ec9fd91f8e885dadf0ce036862de0",
      currentObservationIndex: 89,
      lastTimeStamp: 1644912300,
      mean: 139559,
      dsq: 4200450523426414,
      name: "MATIC",
    },
    {
      underlyingToken: "0x85955046df4668e1dd369d2de9f3aeb98dd2a369",
      chainLink: "0x2e48b7924fbe04d575ba229a59b64547d9da16e9",
      currentObservationIndex: 89,
      lastTimeStamp: 1644912300,
      mean: -676850,
      dsq: 2713075358710737,
      name: "DEFI",
    },
    {
      underlyingToken: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
      chainLink: "0xf9680d99d6c9589e2a93a78a04a279e509205945",
      currentObservationIndex: 89,
      lastTimeStamp: 1644912300,
      mean: -331510,
      dsq: 1682545113740837,
      name: "WETH",
    },
    {
      underlyingToken: "0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a",
      chainLink: "0x49b0c695039243bbfeb8ecd054eb70061fd54aa0",
      currentObservationIndex: 89,
      lastTimeStamp: 1644912300,
      mean: -865908,
      dsq: 4348987405322538,
      name: "SUSHI",
    },
    {
      underlyingToken: "0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c",
      chainLink: "0x10e5f3dfc81b3e5ef4e648c4454d04e79e1e41e2",
      currentObservationIndex: 89,
      lastTimeStamp: 1644912300,
      mean: 201134,
      dsq: 2944661373737654,
      name: "Kyber",
    },
    {
      underlyingToken: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
      chainLink: "0xf9680d99d6c9589e2a93a78a04a279e509205945",
      currentObservationIndex: 89,
      lastTimeStamp: 1644912300,
      mean: -331510,
      dsq: 1682545113740837,
      name: "WETH",
    },
    {
      underlyingToken: "0xb33eaad8d922b1083446dc23f610c2567fb5180f",
      chainLink: "0xdf0fb4e4f928d2dcb76f438575fdd8682386e13c",
      currentObservationIndex: 89,
      lastTimeStamp: 1644912300,
      mean: -714356,
      dsq: 3067608443337710,
      name: "UNI",
    },
    {
      underlyingToken: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
      chainLink: "0xde31f8bfbd8c84b5360cfacca3539b938dd78ae6",
      currentObservationIndex: 89,
      lastTimeStamp: 1644912300,
      mean: -336994,
      dsq: 975713478486621,
      name: "BTC",
    },
  ]

  let priceToken = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"

  for (let i = 0; i < tokenPairs.length; i++) {
    //Add Token Pairs to PriceOracle and VolatilityOracle
    console.log("SETTING TOKEN ", tokenPairs[i].name)
    await (
      await priceOracle.addTokenPair(
        tokenPairs[i].underlyingToken,
        priceToken,
        tokenPairs[i].chainLink,
      )
    ).wait()
    await (
      await volatilityOracle.addTokenPair(
        tokenPairs[i].underlyingToken,
        priceToken,
      )
    ).wait()

    await (
      await volatilityOracle.setAccumulator(
        tokenPairs[i].underlyingToken,
        priceToken,
        tokenPairs[i].currentObservationIndex,
        tokenPairs[i].lastTimeStamp,
        tokenPairs[i].mean,
        tokenPairs[i].dsq,
      )
    ).wait()
  }

  return {
    priceOracle,
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
