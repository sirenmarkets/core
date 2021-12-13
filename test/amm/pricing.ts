import { expectEvent, time } from "@openzeppelin/test-helpers"
import { contract } from "hardhat"
import {
  SimpleTokenInstance,
  MinterAmmInstance,
  AmmDataProviderInstance,
  ERC1155ControllerInstance,
} from "../../typechain"

let deployedAmm: MinterAmmInstance
let deployedAmmDataProvider: AmmDataProviderInstance
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
      deployedAmmDataProvider,
      seriesId,
      deployedERC1155Controller,
      expiration,
    } = await setupAllTestContracts({
      oraclePrice: BTC_ORACLE_PRICE,
      strikePrice: STRIKE_PRICE.toString(),
      isPutOption: true,
    }))

    // Approve collateral
    await collateralToken.mint(ownerAccount, 1000e6)
    await collateralToken.approve(deployedAmm.address, 1000e6)

    // Provide capital
    let ret = await deployedAmm.provideCapital(1000e6, 0)

    expectEvent(ret, "LpTokensMinted", {
      minter: ownerAccount,
      collateralAdded: (1000e6).toString(),
      lpTokensMinted: (1000e6).toString(),
    })

    // Collateral should be moved away from Owner
    assertBNEq(
      await collateralToken.balanceOf(ownerAccount),
      0,
      "Owner should have paid collateral",
    )

    // 1000e6 collateral should be in the AMM.
    assertBNEq(
      await collateralToken.balanceOf(deployedAmm.address),
      1000e6,
      "Collateral should have been used to mint",
    )

    await time.increaseTo(expiration - ONE_WEEK_DURATION) // use the same time, no matter when this test gets called
    assertBNEq(
      (await deployedAmm.getPriceForSeries(seriesId)).toString(),
      "110102040416428571", // 0.1101 WBTC
      "AMM should have correct price for series",
    )

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      1000e6,
      "Total assets value in the AMM should be 10k",
    )

    // Now let's do some trading and see how price behaves
    await collateralToken.mint(aliceAccount, 1e6)
    await collateralToken.approve(deployedAmm.address, 1e6, {
      from: aliceAccount,
    })
    // Buy bTokens
    const maximumCollateral =
      await deployedAmmDataProvider.bTokenGetCollateralInView(
        deployedAmm.address,
        seriesId,
        10000,
      )

    assertBNEq(maximumCollateral, 154329)

    ret = await deployedAmm.bTokenBuy(seriesId, 10000, maximumCollateral, {
      from: aliceAccount,
    })
    assertBNEq(
      (await collateralToken.balanceOf(aliceAccount)).toString(),
      845672, // paid 154,329 for 10000 tokens at ~0.1101 WBTC per 1e8 bToken + price impact
      "Trader should pay correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      (
        await deployedAmmDataProvider.getTotalPoolValueView(
          deployedAmm.address,
          true,
        )
      ).toString(),
      1000000185, // 1000e6 - 10000 * 15000 / 100 + 154329 + 10000 * (15000 / 14000 - 0.1101) * 14000 / 100
      "Total assets value in the AMM should be above 1000e6",
    )

    // Sell bTokens
    await deployedERC1155Controller.setApprovalForAll(
      deployedAmm.address,
      true,
      { from: aliceAccount },
    )
    ret = await deployedAmm.bTokenSell(seriesId, 10000, 153956, {
      from: aliceAccount,
    })
    assertBNEq(
      (await collateralToken.balanceOf(aliceAccount)).toString(),
      999628, // received 153,956 for 10000 tokens at ~0.1101
      "Trader should receive correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      (
        await deployedAmmDataProvider.getTotalPoolValueView(
          deployedAmm.address,
          true,
        )
      ).toString(),
      1000000372,
      "Total assets value in the AMM should be above 1000e6",
    )
  })

  it("should calculate correctly when WBTC is the collateral token", async () => {
    ;({
      collateralToken,
      deployedAmm,
      seriesId,
      deployedERC1155Controller,
      deployedAmmDataProvider,
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
      "38673468987857142", // 0.039 BTC / contract
      "AMM should have correct price for series",
    )

    // Total assets value in the AMM should be 10k.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
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
      841, // paid 159 for 3000 tokens at ~0.039 + slippage
      "Trader should pay correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      10042, // 10000 - 3000 + 159 + 3000 * (1 - 0.039)
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
      924, // received 83 for 3000 tokens at ~0.039 - price impact
      "Trader should receive correct collateral amount",
    )

    // Check total assets value again.
    assertBNEq(
      await deployedAmmDataProvider.getTotalPoolValueView(
        deployedAmm.address,
        true,
      ),
      10076,
      "Total assets value in the AMM should be above 10k",
    )
  })
})
