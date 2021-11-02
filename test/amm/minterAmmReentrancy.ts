import { artifacts, contract } from "hardhat"
import { expectRevert } from "@openzeppelin/test-helpers"

import {
  SimpleTokenInstance,
  MinterAmmInstance,
  ReentrancyCheckerInstance,
} from "../../typechain"

const ReentrancyChecker: any = artifacts.require("ReentrancyChecker")

import { setupAllTestContracts } from "../util"

let reentrancyChecker: ReentrancyCheckerInstance

let deployedAmm: MinterAmmInstance
let collateralToken: SimpleTokenInstance
let seriesId: string

const STRIKE_PRICE = 15000 * 1e8 // 15000 USD
const OTM_BTC_ORACLE_PRICE = 14_000 * 10 ** 8

contract("AMM Reentrancy Verification", (accounts) => {
  const ownerAccount = accounts[0]
  const traderAccount = accounts[1]

  before(async () => {
    reentrancyChecker = await ReentrancyChecker.new()
  })

  beforeEach(async () => {
    ;({ collateralToken, deployedAmm, seriesId } = await setupAllTestContracts({
      strikePrice: STRIKE_PRICE.toString(),
      oraclePrice: OTM_BTC_ORACLE_PRICE,
    }))
  })

  it("Checks provide & withdraw reentrancy", async () => {
    // Approve collateral
    await collateralToken.mint(ownerAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000, 0)

    // Now let's do some trading from another account
    await collateralToken.mint(traderAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: traderAccount,
    })

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(seriesId, 3000, 3000, {
      from: traderAccount,
    })

    // Check reentrancy
    // Send collateral to ReentrancyChecker contract
    await collateralToken.mint(reentrancyChecker.address, 10000)

    // Approve MinterAmm to spend the collateral
    await reentrancyChecker.execute(
      collateralToken.address,
      collateralToken.contract.methods
        .approve(deployedAmm.address, 10000)
        .encodeABI(),
    )

    // Buy bTokens
    await expectRevert(
      reentrancyChecker.execute(
        deployedAmm.address,
        deployedAmm.contract.methods
          .bTokenBuy(seriesId, 3000, 3000)
          .encodeABI(),
      ),
      "ReentrancyGuard",
    )

    // Provide capital
    await reentrancyChecker.execute(
      deployedAmm.address,
      deployedAmm.contract.methods.provideCapital(1000, 900).encodeABI(),
    )

    // Withdraw capital
    await expectRevert(
      reentrancyChecker.execute(
        deployedAmm.address,
        deployedAmm.contract.methods.withdrawCapital(50, false, 0).encodeABI(),
      ),
      "ReentrancyGuard",
    )
  })
})
