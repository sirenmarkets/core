import * as hre from "hardhat"

const DAY_DURATION = 24 * 60 * 60
const WEEK_DURATION = 7 * DAY_DURATION

export async function deployedAmmFactory(
  feeReceiver: string,
  gnosisAddress: string,
  dateOffset: number,
): Promise<any> {
  // each of these singleton contracts is upgradeable, and so we must deploy
  // them via a Proxy after we've deployed the logic contract
  const Proxy = await hre.ethers.getContractFactory("Proxy")

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

  return {
    ammFactory,
  }
}
