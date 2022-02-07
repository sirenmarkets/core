import * as hre from "hardhat"

export async function deployAmm(
  ammFactoryAddress: string,
  sirenOracleAddress: string,
  ammDataProviderAddress: string,
  underlyingTokenAddress: string,
  priceTokenAddress: string,
  collateralTokenAddress: string,
  tradeFeeBasisPoints: number,
  chainlinkOracleAddress: string,
) {
  const AmmFactoryFactory = await hre.ethers.getContractFactory("AmmFactory")

  const ammFactoryContract = AmmFactoryFactory.attach(ammFactoryAddress)

  console.log("creating new AMM...")

  let resp = await (
    await ammFactoryContract.createAmm(
      sirenOracleAddress,
      underlyingTokenAddress,
      priceTokenAddress,
      collateralTokenAddress,
      tradeFeeBasisPoints,
    )
  ).wait()

  const ammCreatedEvent = resp.events.filter(
    (e: any) => e.event == "AmmCreated",
  )[0]
  const ammAddress: string = ammCreatedEvent.args[0]

  console.log(`deployed AMM with address: ${ammAddress.toLowerCase()}`)

  const PriceOracleFactory = await hre.ethers.getContractFactory("PriceOracle")

  const priceOracleContract = PriceOracleFactory.attach(sirenOracleAddress)

  // first, see if the token pair has already been set from a previous AMM deployment, in
  // which case we do not need to attempt to add the token pair
  try {
    await priceOracleContract.getCurrentPrice(
      underlyingTokenAddress,
      priceTokenAddress,
    )

    console.log(
      "the price oracle for this AMM's underlying and price token have already been set",
    )
    return {
      ammAddress,
    }
  } catch (e) {
    // we assume this function fails because the token pair hasn't been set. This is not the only way
    // it can fail, but the other possibilities are low enough probability, and we don't have a better way
    // to check, so we make this assumption

    let resp = await (
      await priceOracleContract.addTokenPair(
        underlyingTokenAddress,
        priceTokenAddress,
        chainlinkOracleAddress,
      )
    ).wait()

    const oracleSetEvent = resp.events.filter(
      (e: any) => e.event == "OracleSet",
    )[0]

    if (oracleSetEvent != null) {
      console.log(
        `successful call to PriceOracle.addTokenPair for underlying: ${underlyingTokenAddress} and price: ${priceTokenAddress}`,
      )
    } else {
      throw new Error(
        `unable to add token pair for underlying: ${underlyingTokenAddress} and price: ${priceTokenAddress}`,
      )
    }

    return {
      ammAddress,
    }
  }
}
