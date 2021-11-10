import { expectEvent, time } from "@openzeppelin/test-helpers"
import { contract } from "hardhat"
import {
  SimpleTokenInstance,
  MinterAmmInstance,
  ERC1155ControllerInstance,
} from "../../typechain"

let deployedAmm: MinterAmmInstance
let deployedERC1155Controller: ERC1155ControllerInstance
let collateralToken: SimpleTokenInstance

let seriesId: string
let expiration: number

import { assertBNEq, ONE_WEEK_DURATION, setupAllTestContracts } from "../util"

const BTC_ORACLE_PRICE = 14_000 * 1e8 // BTC oracle answer has 8 decimals places, same as BTC
const STRIKE_PRICE = 15_000 * 1e8

contract("AMM Pricing", (accounts) => {
  const ownerAccount = accounts[0]
  const aliceAccount = accounts[1]

  it("should calculate correctly when USDC is the collateral token", async () => {
    ;({
      collateralToken,
      deployedAmm,
      seriesId,
      deployedERC1155Controller,
      expiration,
    } = await setupAllTestContracts({
      oraclePrice: BTC_ORACLE_PRICE,
      strikePrice: STRIKE_PRICE.toString(),
      isPutOption: true,
    }))

    // Approve collateral
    await collateralToken.mint(ownerAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "10000",
      lpTokensMinted: "10000",
    })

    // Collateral should be moved away from Owner
    assertBNEq(
      await collateralToken.balanceOf(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 10k collateral should be in the AMM.
    assertBNEq(
      await collateralToken.balanceOf(deployedAmm.address),
      10000,
      "Collateral should have been used to mint",
    )

    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called
    assertBNEq(
      (await deployedAmm.getPriceForSeries(seriesId)).toString(),
      "71428571428571428", // 0.099 WBTC
      "AMM should have correct price for series",
    )

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmm.getTotalPoolValue(true),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    // Now let's do some trading and see how price behaves
    await collateralToken.mint(aliceAccount, 1e6)
    await collateralToken.approve(deployedAmm.address, 1e6, {
      from: aliceAccount,
    })
    console.log("ALSKDFNALSKDFNALSKDNFLASKNDFLSAKNDFLASKNDFKNLASD")
    console.log(
      "ALICE ====",
      (await collateralToken.balanceOf(aliceAccount)).toString(),
    )
    // Buy bTokens
    const maximumCollateral = await deployedAmm.bTokenGetCollateralIn(
      seriesId,
      1000,
    )

    assertBNEq(maximumCollateral, 140054)

    ret = await deployedAmm.bTokenBuy(seriesId, 1000, maximumCollateral, {
      from: aliceAccount,
    })
    assertBNEq(
      (await collateralToken.balanceOf(aliceAccount)).toString(),
      859946, // paid 140054 for 1000 tokens at ~0.099 WBTC per 1e8 bToken
      "Trader should pay correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toString(),
      139254,
      "Total assets value in the AMM should be above 10k",
    )

    // Sell bTokens
    await deployedERC1155Controller.setApprovalForAll(
      deployedAmm.address,
      true,
      { from: aliceAccount },
    )
    ret = await deployedAmm.bTokenSell(seriesId, 1000, 4, {
      from: aliceAccount,
    })
    assertBNEq(
      (await collateralToken.balanceOf(aliceAccount)).toString(),
      859950, // received 4 for 1000 tokens at ~0.027
      "Trader should receive correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      (await deployedAmm.getTotalPoolValue(true)).toString(),
      150050,
      "Total assets value in the AMM should be above 10k",
    )
  })
  it("should calculate correctly when WBTC is the collateral token", async () => {
    ;({
      collateralToken,
      deployedAmm,
      seriesId,
      deployedERC1155Controller,
      expiration,
    } = await setupAllTestContracts({
      oraclePrice: BTC_ORACLE_PRICE,
      strikePrice: STRIKE_PRICE.toString(),
    }))

    // Approve collateral
    await collateralToken.mint(ownerAccount, 10000)
    await collateralToken.approve(deployedAmm.address, 10000)

    // Provide capital
    let ret = await deployedAmm.provideCapital(10000, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: "10000",
      lpTokensMinted: "10000",
    })

    // Collateral should be moved away from Owner
    assertBNEq(
      await collateralToken.balanceOf(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 10k collateral should be in the AMM.
    assertBNEq(
      await collateralToken.balanceOf(deployedAmm.address),
      10000,
      "Collateral should have been used to mint",
    )

    // Total assets value in the AMM should be 10k.
    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called
    assertBNEq(
      (await deployedAmm.getPriceForSeries(seriesId)).toString(),
      "29008000000000000", // 0.029 BTC / contract
      "AMM should have correct price for series",
    )

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmm.getTotalPoolValue(true),
      10000,
      "Total assets value in the AMM should be 10k",
    )

    // Now let's do some trading and see how price behaves
    await collateralToken.mint(aliceAccount, 1000)
    await collateralToken.approve(deployedAmm.address, 1000, {
      from: aliceAccount,
    })

    // Buy bTokens
    ret = await deployedAmm.bTokenBuy(seriesId, 3000, 3000, {
      from: aliceAccount,
    })
    assertBNEq(
      await collateralToken.balanceOf(aliceAccount),
      880, // paid 120 for 3000 tokens at ~0.029 + slippage
      "Trader should pay correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      await deployedAmm.getTotalPoolValue(true),
      10032,
      "Total assets value in the AMM should be above 10k",
    )

    // Sell bTokens
    await deployedERC1155Controller.setApprovalForAll(
      deployedAmm.address,
      true,
      { from: aliceAccount },
    )
    ret = await deployedAmm.bTokenSell(seriesId, 3000, 0, {
      from: aliceAccount,
    })
    assertBNEq(
      await collateralToken.balanceOf(aliceAccount),
      942, // received 62 for 3000 tokens at ~0.029
      "Trader should receive correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      await deployedAmm.getTotalPoolValue(true),
      10058,
      "Total assets value in the AMM should be above 10k",
    )
  })
})
