import * as hre from "hardhat"
const { request, gql } = require("graphql-request")

const DAY_DURATION = 24 * 60 * 60
const WINDOW_SIZE = 90
const WEEK_DURATION = 7 * DAY_DURATION

export async function deployOracles(
  priceOracleProxy: string,
  volOracleProxyAddress: string,
): Promise<any> {
  const [signer] = await hre.ethers.getSigners()
  const deployerAddress = signer.address.toLowerCase()

  console.log(`deployer address is: ${deployerAddress}`)

  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle")
  const VolatilityOracle = await hre.ethers.getContractFactory(
    "VolatilityOracle",
  )

  let priceOracle = PriceOracle.attach(priceOracleProxy)
  console.log(
    "PriceOracle set to:             ",
    priceOracle.address.toLowerCase(),
  )

  const volatilityOracle = VolatilityOracle.attach(volOracleProxyAddress)
  console.log(
    "VolatilityOracle set to:             ",
    volatilityOracle.address.toLowerCase(),
  )

  console.log("Set up all Oracles")

  let tokenPairs = [
    // {
    //   underlyingToken: "0xda537104d6a5edd53c6fbba9a898708e465260b6",
    //   chainLink: "0xecbff2ee735bee23c17652ae4e1f76c30a69b247",
    //   currentObservationIndex: 89,
    //   lastTimeStamp: 1645344300,
    //   mean: -421423,
    //   dsq: 4157456567528384,
    //   name: "YFI",
    //   price: 2049078727730
    // },
    // {
    //   underlyingToken: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    //   chainLink: "0xab594600376ec9fd91f8e885dadf0ce036862de0",
    //   currentObservationIndex: 89,
    //   lastTimeStamp: 1645344300,
    //   mean: 9747,
    //   dsq: 4129071612177569,
    //   name: "MATIC",
    //   price:152806414
    // },
    // {
    //   underlyingToken: "0x85955046df4668e1dd369d2de9f3aeb98dd2a369",
    //   chainLink: "0x2e48b7924fbe04d575ba229a59b64547d9da16e9",
    //   currentObservationIndex: 89,
    //   lastTimeStamp: 1645344300,
    //   mean: -792909,
    //   dsq: 2623826445999184,
    //   name: "DEFI",
    //   price:16053907079
    // },
    // {
    //   underlyingToken: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
    //   chainLink: "0xf9680d99d6c9589e2a93a78a04a279e509205945",
    //   currentObservationIndex: 89,
    //   lastTimeStamp: 1645344300,
    //   mean: -488647,
    //   dsq: 1620994739462086,
    //   name: "WETH",
    //   price:264687000000,
    // },
    {
      underlyingToken: "0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a",
      chainLink: "0x49b0c695039243bbfeb8ecd054eb70061fd54aa0",
      currentObservationIndex: 89,
      lastTimeStamp: 1645344300,
      mean: -906812,
      dsq: 4305521669927165,
      name: "SUSHI",
      price: 363343043,
    },
    {
      underlyingToken: "0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c",
      chainLink: "0x10e5f3dfc81b3e5ef4e648c4454d04e79e1e41e2",
      currentObservationIndex: 89,
      lastTimeStamp: 1645344300,
      mean: 120269,
      dsq: 2859223529265166,
      name: "Kyber",
      price: 192300000,
    },
    {
      underlyingToken: "0xb33eaad8d922b1083446dc23f610c2567fb5180f",
      chainLink: "0xdf0fb4e4f928d2dcb76f438575fdd8682386e13c",
      currentObservationIndex: 89,
      lastTimeStamp: 1645344300,
      mean: -856452,
      dsq: 2989578224704563,
      name: "UNI",
      price: 939203101,
    },
    {
      underlyingToken: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
      chainLink: "0xde31f8bfbd8c84b5360cfacca3539b938dd78ae6",
      currentObservationIndex: 89,
      lastTimeStamp: 1645344300,
      mean: -424325,
      dsq: 986730496533059,
      name: "BTC",
      price: 3835500000000,
    },
  ]

  let priceToken = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"

  for (let i = 0; i < tokenPairs.length; i++) {
    //Add Token Pairs to PriceOracle and VolatilityOracle
    console.log("SETTING TOKEN ", tokenPairs[i].name)
    await (
      await volatilityOracle.setLastPrice(
        tokenPairs[i].underlyingToken,
        priceToken,
        tokenPairs[i].price,
      )
    ).wait()
    console.log("VolaitltuyOracle SET")
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
