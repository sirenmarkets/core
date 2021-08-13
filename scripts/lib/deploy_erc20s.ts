import * as hre from "hardhat"
import { BigNumber } from "ethers"

export async function deployERC20s(owner: string) {
  const SimpleToken = await hre.ethers.getContractFactory("SimpleToken")

  const wbtc = await SimpleToken.deploy()
  await wbtc.deployed()
  await (await wbtc.initialize("Wrapped Bitcoin", "WBTC", 8)).wait()
  console.log(`deployed WBTC SimpleToken: ${wbtc.address.toLowerCase()}`)

  // mint 1 billion for the owner
  await wbtc.mint(owner, BigNumber.from(1e9).mul(BigNumber.from(1e8)))

  const usdc = await SimpleToken.deploy()
  await usdc.deployed()
  await (await usdc.initialize("USD Coin", "USDC", 6)).wait()
  console.log(`deployed USDC SimpleToken: ${usdc.address.toLowerCase()}`)

  // mint 1 billion for the owner
  await usdc.mint(owner, BigNumber.from(1e9).mul(BigNumber.from(1e6)))

  const weth = await SimpleToken.deploy()
  await weth.deployed()
  await (await weth.initialize("Wrapped ETH", "WETH", 18)).wait()
  console.log(`deployed WETH SimpleToken: ${weth.address.toLowerCase()}`)

  // mint 1 billion for the owner
  const wethMintAmount = BigNumber.from(1e9).mul(
    BigNumber.from(1e9).mul(BigNumber.from(1e9)),
  )
  await weth.mint(owner, wethMintAmount)

  return {
    wbtc,
    usdc,
    weth,
  }
}
