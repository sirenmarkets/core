## Verification of SeriesController

### Contract description

The series controller is responsible for issuing and redeeming tokens
representing options. The writer of an option can deposit collateral in return
for an equal number of bTokens and wTokens.

Before the option expires, the collateral can be withdrawn in exchange for the
b- and wTokens. After it expires, the collateral is divided up into a bShare
and a wShare based on the settlement price of the underlying asset at close,
and the bTokens and wTokens can be exchanged for the corresponding shares of
the collateral.

Our verification efforts focused on the management of tokens (both option tokens
and collateral tokens). The series controller also has support for pausing and
unpausing, upgrading, and fees; we have not focused carefully on the behavior of
those features.

### Bugs found and recommendations

We did not find any vulnerabilities in the series controller.

We had a few small suggestions based on our review of the code:

- `SeriesVault.series(uint256 seriesId)` accepts a `uint256` argument; in all
  other places in the code, series ids are represented as `uint64`.

- several exponeniations, multiplications, and divisions (and some possibility
  of unnecessary overflow) could be avoided in calculation of decimals by
  computing the exponent first, and only then exponentiating.

- `seriesBalances` could be stored as an array instead of a mapping, since it
  has the same keyspace as the `allSeries` array.

- `SeriesVault.setApprovalForController` had an incorrect return type.

### Assumptions and simplifications made during verification

- fees were assumed to be zero (`calculateFee` overridden in harness)

- we assume that ERC20 tokens are well-behaved

- we removed the decimals calculations from `getCollateralPerOptionToken`,
  effectively assuming that all decimals are 0.

- we assume that the price oracle is non-reentrant, and that
  the return value from `PriceOracle.getCurrentPrice` does not change within a
  transaction

- we set CVT to unroll loops twice: rule violations that require loops to iterate
  more than twice will not be caught.

We also made some other simplifications that should have no practical impact:

- we removed calls to IAddSeriesToAmm.addSeries and
  optionTokenTotalSupplyBatch, assuming that they are non-reentrant and
  therefore have no effects on this contract

- we overrode the `getSeriesName` method to return the empty string

### Important state variables and invariants

The following state variables describe the relevant state of the series controller:

```
collateralPerOption: series => collateral amount
isOpen/isExpired:    series => bool
seriesBalances:      series => collateral amount
bShare/wShare:       series => option amount => collateral amount
wBalance/bBalance:   series => address => option amount
wSupply/bSupply:     series => option amount
collateralToken:     series => collateral token id
vaultBalance:        collateral token id => collateral amount
```

We have verified that these state variables are related as follows:

1. (![passing])[^vaultbalance][^noinit][^vbregression] `[seriesBalanceEQtokenBalance]`
   : the vault balance is equal to the sum of all seriesBalances for series with the corresponding collateral token.

[^vaultbalance]:
    We've verified a slightly different statement of this property:
    after calling any method, the change in the seriesBalance is equal to the
    change in the vault balance. This is equivalent to the stated property
    (assuming all balances start at zero), but is easier for the verifier to check.

[^vbregression]:
    This rule was passing, but due to some changes in the tool and our rules, it
    now causes the tool to run out of memory. We are working on the tool's
    memory usage and we expect this rule to start working again soon.

[^noinit]: This property is not checked on the initialization method.

2. (![timeout])[^triedsplit][^noinit] `[seriesSolvency]`
   : for each series, the seriesBalance is equal to the bShare of the outstanding bTokens plus the wShare of the outstanding wTokens.

[^triedsplit]:
    We attempted to simplify this rule by running it only on the call options;
    in this case the conversion rate between option tokens and collateral tokens
    is 1, so the math is simpler. Unfortunately, this version still timed out
    in some cases.

3. (![passing]) `[shareSum]`
   : the sum of the bShare and wShare of `n` tokens is `n * collateralPerOption`.

4. (![passing])[^noinit][^nocreate] `[optionTokenSupply]`
   : for an open series, the number of outstanding wTokens is equal to the number of outstanding bTokens.

[^nocreate]:
    This property does not pass on the `createSeries` method, but is trivially
    true since there are no b- or wTokens when a series is created. The reason
    it doesn't pass is because we have not checked the invariant that before a

:::info
Note: consistency between the erc1155Controller's fields are checked separately;
see [erc1155ControllerReport.md](erc1166ControllerReport.md).
:::

### State evolution

5. (![passing]) `[noChangeToOtherSeries]`
   : if series balance of `seriesId` changes, it is changed by `exerciseOption`, `claimCollateral`, `mintOptions`, or `closePosition`, with the `seriesId` as the series argument.

6. (![passing]) `[exerciseOnlyOnExpired], [noWithdrawOnOpen], [noCloseOnExpired]`
   : options can only be closed on open options, and only withdrawn or exercised on closed options

### High-level properties

7. (![passing]) No gain
   : A user cannot profit from minting, then exercising and claiming the minted tokens.

8. (![passing]) No double exercise
   : Immediately after exercising all of one's bTokens, another call to `exerciseOption` will revert.

### Unimplemented rules

The following rules were considered for verification, but were not completed due
to time constraints. Additional unimplemented rules can be found in an [earlier
draft report][oldreport].

bSupply/wSupply evolution
: if the wSupply or bSupply for a series changes, then the supply increases if and only if the series is open

mintOptions specification
: a successful call to `mintOptions(series, amount)` (a) requires the series to be open, (b) accepts `amount * collateralPerOptions` collateral tokens, (c) increases caller's bToken balance by `amount`, and (d) increases caller's wToken balance by `amount`

exerciseOption specification
: a successful call to `exerciseOption(series, amount, _)` (a) requires the series to be expired, (b) burns `amount` of caller's bTokens, and (c) increases caller's collateral balance by the bShare of amount

claimCollateral specificiation
: a successful call to `claimCollateral(series, amount)` (a) requires series to be expired, (b) burns `amount` of caller's wTokens, and (c) increases caller's collateral balance by the wShare of amount

closePosition specification
: a successful call to `closePosition(series, amount)` (a) requires `series` to be open, (b) burns `amount` of caller's wTokens, (c) burns `amount` of caller's bTokens, and (d) increases caller's collateral balance by `amount * collateralPerOptions`

[passing]: success.png "Rule passes in all cases"
[failing]: failed.png "Rule fails in some cases, see note"
[timeout]: timeout.png "Rule times out"
[todo]: todo.png "Work in progress"

[oldreport]:
