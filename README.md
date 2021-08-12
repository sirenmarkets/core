<p align="center">
  <a href="https://sirenmarkets.com/">
    <img src="siren_Banner.png" alt="SIREN logo" title="Go to
sirenmarkets.com" width="600" style="border:none;"/>
  </a>
</p>

# Siren Markets Core Smart Contracts

This repository contains the source code for the Siren Markets core smart contracts.

<!-- row 1 - status -->

![SIREN CI](https://github.com/sirenmarkets/core/workflows/SIREN%20CI/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/sirenmarkets/core/badge.svg?branch=master&t=QOFawf)](https://coveralls.io/github/sirenmarkets/core?branch=master)
[![GitHub contributors](https://img.shields.io/github/contributors/sirenmarkets/core)](https://github.com/sirenmarkets/core/graphs/contributors)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/w/sirenmarkets/core)](https://github.com/sirenmarkets/core/graphs/contributors)
[![GitHub Stars](https://img.shields.io/github/stars/sirenmarkets/core.svg)](https://github.com/sirenmarkets/core/stargazers)
![GitHub repo size](https://img.shields.io/github/repo-size/sirenmarkets/core)
[![GitHub](https://img.shields.io/github/license/sirenmarkets/core?color=blue)](https://github.com/sirenmarkets/core/blob/master/LICENSE)

<!-- row 2 - links & profiles -->

[![Website sirenmarkets.com](https://img.shields.io/website-up-down-green-red/https/sirenmarkets.com.svg)](https://sirenmarkets.com)
[![Blog](https://img.shields.io/badge/blog-up-green)](http://sirenmarkets.medium.com/)
[![Docs](https://img.shields.io/badge/docs-up-green)](https://docs.sirenmarkets.com/)
[![Governance](https://img.shields.io/badge/governance-up-green)](https://gov.sirenmarkets.com/)
[![Twitter SirenProtocol](https://img.shields.io/twitter/follow/sirenprotocol?style=social)](https://twitter.com/sirenprotocol)

<!-- row 3 - detailed status -->

[![GitHub pull requests by-label](https://img.shields.io/github/issues-pr-raw/sirenmarkets/core)](https://github.com/sirenmarkets/core/pulls)
[![GitHub Issues](https://img.shields.io/github/issues-raw/sirenmarkets/core.svg)](https://github.com/sirenmarkets/core/issues)

## Mainnet Contract List

- [AmmFactory](https://docs.sirenmarkets.com/developers/amm-factory)
- [SeriesController](https://docs.sirenmarkets.com/developers/series-controller)
- [SeriesVault](https://docs.sirenmarkets.com/developers/series-vault)
- [ERC1155Controller](https://docs.sirenmarkets.com/developers/erc1155-controller)
- [PriceOracle](https://docs.sirenmarkets.com/developers/price-oracle)

## Build and test

```
$ npm install
$ npm test
```

## Design Goals

- Build a fully unit tested system with 100% code coverage, including error scenarios and event logging
- Allow the Siren system to be upgradeable over time by the governance system to include new functionality not included in the initial launch, without requiring migration to a new token (e.g. Augur)
- Minimize gas by deploying proxy contracts whenever possible instead of full logic contracts
- Utilize Open Zeppelin contracts whenever possible instead of rolling our own version
- Fully comment the codebase so new developers can quickly grok the protocol and contribute

## Protocol Overview

See the [technical documentation](https://docs.sirenmarkets.com/developers/contract-architecture) for more details on the protocol

## Series Lifecycle Example

Below is one of the unit tests showing the flow for, minting options, exercising an option, and claiming the remaining series' collateral.

```typescript
it("Allows claiming after expiration with full redemptions", async () => {
  // Amount we will be minting
  const MINT_AMOUNT = 100

  // Give Alice 100 tokens
  await collateralToken.mint(aliceAccount, MINT_AMOUNT)

  // Save off the tokens
  const bTokenIndex = await deployedSeriesController.bTokenIndex(seriesId)

  // approve the amount and mint alice some options - wBTC collateral will be locked into series contract
  await collateralToken.approve(deployedSeriesController.address, MINT_AMOUNT, {
    from: aliceAccount,
  })
  await deployedSeriesController.mintOptions(seriesId, MINT_AMOUNT, {
    from: aliceAccount,
  })

  // Send the bTokens from alice to Bob - simulates alice selling option
  await deployedERC1155Controller.safeTransferFrom(
    aliceAccount,
    bobAccount,
    bTokenIndex,
    MINT_AMOUNT,
    "0x0",
    { from: aliceAccount },
  )

  // Move the block time into the future so the contract is expired
  await time.increaseTo(expiration + ONE_DAY)

  // Bob exercises
  await deployedERC1155Controller.setApprovalForAll(
    deployedSeriesController.address,
    true,
    { from: bobAccount },
  )
  await deployedSeriesController.exerciseOption(seriesId, MINT_AMOUNT, true, {
    from: bobAccount,
  })

  // Should succeed from Alice claiming leftover collateral
  await deployedERC1155Controller.setApprovalForAll(
    deployedSeriesController.address,
    true,
    { from: aliceAccount },
  )
  await deployedSeriesController.claimCollateral(seriesId, MINT_AMOUNT, {
    from: aliceAccount,
  })

  // Bob should own his share of collateral tokens
  assertBNEq(
    await collateralToken.balanceOf(bobAccount),
    "17",
    "bob should have his collateral",
  )

  // Alice should own her share of collateral tokens
  assertBNEq(
    await collateralToken.balanceOf(aliceAccount),
    "83",
    "alice should have her collateral",
  )
})
```

## Development

This repo will generate TS clients for the contracts on install. When updating the contracts, the TS definitions can be manually updated by:

1. Running `npm run compile`
2. Running `npm run build`

The compiled JSON ABI files should be commited after deployment so that the deployment metadata is available in the repo.
