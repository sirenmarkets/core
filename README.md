<p align="center">
  <a href="https://sirenmarkets.com/">
    <img src="siren_Banner.png" alt="SIREN logo" title="Go to
sirenmarkets.com" width="600" style="border:none;"/>
  </a>
</p>

# SIREN Core Smart Contracts

This repository contains the source code for the SIREN core smart contracts.

<!-- row 1 - status -->

![SIREN CI](https://github.com/sirenmarkets/core/workflows/SIREN%20CI/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/sirenmarkets/core/badge.svg)](https://coveralls.io/github/sirenmarkets/core?branch=master)
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

- [MarketsRegistry](https://etherscan.io/address/0xB8623477eA6f39B63598ceac4559728DCa81af63#readProxyContract)
- [WBTC CALL AMM](https://etherscan.io/address/0x87a3ef113c210ab35afebe820ff9880bf0dd4bfc#readProxyContract)
- [WBTC PUT AMM](https://etherscan.io/address/0x25bc339170adbff2b7b9ede682072577fa9d96e8#readProxyContract)

## Build and test

```
$ npm install
$ npm run test
```

## Design Goals

- Build a fully unit tested system with 100% code coverage, including error scenarios and event logging
- Allow the Siren system to be upgradeable over time by the governance system to include new functionality not included in the initial launch, without requiring migration to a new token (e.g. Augur)
- Minimize gas by deploying proxy contracts whenever possible instead of full logic contracts
- Utilize Open Zeppelin contracts whenever possible instead of rolling our own version
- Fully comment all functionality so anyone can understand what is going on

## Token Contracts

The ERC20 token contracts being used for both the bToken and wToken are derived from the Open Zeppelin library. For the initial release, all that is needed is that the Market contract should be able to mint and burn as options are created and exercised.

## Market Contracts

These are the contracts that most users will interact with to create and exercise options.

When options are created, the creator receives an equal amount of bTokens and wTokens that equals the same amount of collateral that they have locked up.

Collateral Tokens (such as wBTC) will be locked up in this contract when new options are minted and held until either:

- A holder of an bToken decides to exercise the option by paying the required payment token amount to get the collateral
- The option expires and the holder of a wToken can claim any owed collateral or payment tokens
- A holder of both wToken and bToken decides to close out their previously created option

### Market Configuration

Each market has a unique set of:

- Payment Token
- Collateral Token
- Expiration Date
- Strike Price (stored as a ratio between Payment and Collateral)
- Fee structure

All variables will be locked in at Market creation time.

### Market States

When the blockchain timestamp is before the Expiration Date, the market is in the OPEN state. After the Expiration Date, the market is in the EXPIRED state. 180 days after the Expiration date, the market is CLOSED

- Redemptions and Closings can only be done in the OPEN state.
- Claiming of collateral/payments can only be done in the EXPIRED state.
- Sweeping any abandoned tokens and destroying the contract can only be done in the CLOSED state.

### Fees

Fees will be deducted and sent to the Markets Module as a percentage of the amount being transferred out of the contract. Fees will be stored as basis points where 100 basis points equals 1%. Fees can be set to 0 and not charge anything.

Fees can be collected for value transfers leaving the market contract (no fees for creating options):

- Exercise: A percentage can be subtracted from the collateral being exercised.
- Closing: A percentage can be subtraced from the collateral being redeemed.
- Claiming Collateral: A percentage can be subtraced from both the collateral and payment amount being claimed.

### Destroying a Market

6 Months after the expiration date, the Markets Module will have the capability to sweep out any tokens still held in the contract and destroy the Market contract by causing selfdestruct. This will credit the caller with gas and will reduce the burden on creating new markets as time goes on.

## Markets Module

The Markets Module will be responsible for:

- Tracking the implementation address of the Markets and Tokens contracts and allowing upgrades by the governance module
- Deploying new Markets
- Tracking the states of the Markets

The Markets Module will be set as the "Owner" account on any deployed Markets, so it can take any administrative actions (such as destroying an old Market).

The Markets Module will be "Owned" by the Governance Module and allow administrative actions from this account (such as upgrading the logic address of the Market Contract).

## Governance Module

The Governance Module will be an ERC20 token for ownership tracking. This should allow proposals and voting on actions to take from the context of the Governance Module smart contract address.

See the Compound Governance module for details.

Also, the Governance Module should allow incentivization through staking/etc... TBD on exact mechanism, but incentivising liquidity will be the overarching goal.

Fees collected will accrue value to the Governance Token holders via direct distribution or buy/burn mechanisms.

## Example

Below is one of the unit tests showing the flow for creating an option market, minting options, exercising an option, and claiming payment.

```
  it('Allows claiming after expiration with full redemptions', async () => {
    // Create a collateral token
    const collateralToken = await SimpleToken.new()
    await collateralToken.initialize(
      'Wrapped BTC',
      'WBTC'
    )

    // Create a payment token
    const paymentToken = await SimpleToken.new()
    await paymentToken.initialize(
      'USD Coin',
      'USDC'
    )

    // Amount we will be minting
    const MINT_AMOUNT = 100

    // Give Alice 100 tokens
    await collateralToken.mint(aliceAccount, MINT_AMOUNT)

    // Mint bob the amount of tokens he needs
    await paymentToken.mint(bobAccount, MINT_AMOUNT * 10000)

    // Get the current block time
    const currentTime = await time.latest()
    const twoDays = 2 * 60 * 60 * 24

    // Set the expiration to 2 days from now
    const expiration = parseInt(currentTime) + twoDays

    // Price ratio will be 10k base units of usdc per wbtc
    const priceRatio = new BN(10000).mul(new BN(10).pow(new BN(18)))

    deployedMarket.initialize(
      NAME,
      collateralToken.address,
      paymentToken.address,
      priceRatio,
      expiration,
      0, // 0 fees
      0, // 0 fees
      0, // 0 fees
      tokenLogic.address
    )

    // Save off the tokens
    const wToken = await SimpleToken.at(await deployedMarket.wToken.call())
    const bToken = await SimpleToken.at(await deployedMarket.bToken.call())

    // approve the amount and mint alice some options - wBTC collateral will be locked into market contract
    await collateralToken.approve(deployedMarket.address, MINT_AMOUNT, {from: aliceAccount})
    await deployedMarket.mintOptions(MINT_AMOUNT, {from: aliceAccount})

    // Send the bTokens from alice to Bob - simulates alice selling option
    await bToken.transfer(bobAccount, MINT_AMOUNT, {from: aliceAccount})

    // Bob redeems all bTokens by paying the USDC
    await paymentToken.approve(deployedMarket.address, MINT_AMOUNT * 10000, {from: bobAccount})
    await deployedMarket.exerciseOption(MINT_AMOUNT, {from: bobAccount})

    // Move the block time into the future so the contract is expired
    await time.increase(twoDays + 1)

    // Should succeed from Alice claiming payments from bob
    await deployedMarket.claimCollateral(MINT_AMOUNT, {from: aliceAccount})

    // Alice should now own all payment tokens
    assert.equal(await paymentToken.balanceOf.call(aliceAccount), MINT_AMOUNT * 10000, 'alice should end up with all payent')

    // Bob should own all collateral tokens
    assert.equal(await collateralToken.balanceOf.call(bobAccount), MINT_AMOUNT, 'bob should end up with all collateral')
  })
```

## Strike Price Ratio

In order to support both call and put options, the strike price may be above or below 1. Since each token may have a different number of decimals and Solidity does not support decimal numbers, the Strike Price Ratio uses 10^18 to equal 1.

The Strike Price Ratio is the ratio of payment tokens in base units to collateral tokens in base units that would equal a strike price.

If tokens are 1 to 1 and have the same decimals, the ratio would just be 10^18.

Example, assume wBTC and USDC have the same decimals in their token contracts, and the strike price of the option is 10,000, then the ratio would be `10,000 * 10^18`.

In reality wBTC has 8 decimals and USDC has 6 decimals, so we need to correct the ratio. This would be `10,000 * 10^18 * 10^6 / 10^8`.

`Strike Price Ratio = PaymentTokensPerCollateralToken * 10^18 * PaymentTokenDecimals / CollateralTokenDecimals`

There is a function in the Market.sol contract to calculate the amount of payment token required for a given amount of collateral.

```
/**
* If an bToken is redeemed for X collateral, calculate the payment token amount.
*/
function calculatePaymentAmount(uint256 collateralAmount)
  public
  view
  returns (uint256)
{
  return (collateralAmount * priceRatio) / (10**18);
}
```

## Development

This repo will generate TS clients for the contracts on install. When updating the contracts, the TS definitions can be manually updated by:

1. Running `npm run compile`
2. Running `npm run build`

The compiled JSON ABI files should be commited after deployment so that the deployment metadata is available in the repo.
