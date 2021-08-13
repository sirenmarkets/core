import * as hre from "hardhat"

export async function deploySeries(
  seriesControllerAddress: string,
  underlyingTokenAddress: string,
  priceTokenAddress: string,
  collateralTokenAddress: string,
  strikePrice: number,
  expirationDate: number,
  restrictedMinter: string,
  isPutOption: boolean,
) {
  const SeriesController = await hre.ethers.getContractFactory(
    "SeriesController",
  )

  const seriesControllerContract = SeriesController.attach(
    seriesControllerAddress,
  )

  console.log("creating new Series...")

  const resp = await (
    await seriesControllerContract.createSeries(
      {
        underlyingToken: underlyingTokenAddress,
        priceToken: priceTokenAddress,
        collateralToken: collateralTokenAddress,
      },
      [strikePrice],
      [expirationDate],
      [restrictedMinter],
      isPutOption,
    )
  ).wait()

  const seriesCreatedEvent = resp.events.filter(
    (e: any) => e.event == "SeriesCreated",
  )[0]
  const seriesId: string = seriesCreatedEvent.args[0]

  console.log(`deployed Series with index: ${seriesId}`)

  return {
    seriesId,
  }
}
