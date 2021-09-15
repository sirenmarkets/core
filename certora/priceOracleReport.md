# PriceOracle Contract

## Contract description

The price oracle is responsible for managing references to underlying oracles
and storing historical prices for different token pairs (referred to as
the _underlying_ and the _currency_).

For each token pair, the PriceOracle stores price data for _epoch boundaries_,
which are 8am timestamps for a daily aligned PriceOracle, or 8am Friday
timestamps for a weekly aligned PriceOracle.

The price oracle fetches prices from the underlying oracles by calling
`latestRoundData()`; this price is associated with the beginning of the current
epoch, and is possibly also used to set missing past prices.

### Bugs found and recommendations

- In `addTokenPair`, if the provided underlying oracle returns a price of 0,
  the token pair will become unusable. `addTokenPair` should revert in this
  case.

- The `require(latestAnswer >= 0, ...)` statement in `getCurrentPrice` is
  misleading, although harmless. Changing it to `require(latestAnswer > 0, ...)`
  would more closely match the expectations.

### Assumptions made during verification

- We assume that methods in the underlying oracles do not make calls back into
  the PriceOracle. This assumption is used by assuming that `latestRoundData`
  returns a nondeterministic value but does not have side effects on the
  PriceOracle's state.

- We assume that the proxying and upgrading behavior is correct. Our harness
  replaces `updateImplementation` with a no-op before verification.

- We assume that the inherited OpenZeppelin ownership management functions are
  correct. Our harness replaces `renounceOwnership` and `transferOwnership`
  with no-ops before verification.

- We only verify that the results from `get8amWeeklyOrDailyAligned` are spaced
  apart by a day or a week as appropriate, but not that they are correctly
  aligned (for example, an implementation that always returned Thursdays at 2pm
  instead of Fridays at 8am would satisfy our specs, but an implementation that
  returns Thursdays at 2pm and Fridays at 4am would not).

Although 0 is considered an invalid price, we do not assume that the underlying
oracles do not return 0 from `latestRoundData`.

### Important state variables and invariants

The following variables define the state of a PriceOracle:

- `owner ()`: the contract owner
- `dateOffset ()`: size of an epoch
- `oracles (u,c)`: oracles used to fetch underlying price data
- `settlementPrices (u,c,t)`: stored historical prices at epoch boundaries
- `initialized ()`: whether the PriceOracle has been initialized

We have verified that these state variables are related as follows:

1. (![passing]) Initialization
   1.1 `[ dateOffset_inititalization]` dateOffset is nonzero if and only if initialized
   1.2 `[ owner_inititalization]` owner is nonzero if and only if initialized
   1.3 `[ oracles_inititalization]` oracle(u,c) is zero if uninitialized
   1.4 `[ price_inititalization]` price(u,c,t) is zero if uninitialized

2. (![passing]) Date Offset
   2.1 `[dateOffset_value]` if initialized, the dateOffset is either 1 day or 1 week

3. (![passing]) Prices
   3.1 `[price_domain]`
   price(u,c) is only nonzero if (u,c) has an oracle

3.2 (![failing])[^oraclezero] `[price_nontrivial]`
if (u,c) has an oracle
then there exists t with nonzero price(u,c,t)

[^oraclezero]:

This property does not hold if an underlying oracle returns 0 as
a price during `addToken`.

3.3 (![passing]) `[price_spacing]`
if price(u,c,t1) and price(u,c,t2) are nonzero
then t1 and t2 differ by at least an epoch

3.4 (![passing]) `[price_compact_right]`:
if price(u,c,t1) is set and price(u,c,t1+dateOffset) is not,
then for all t > t1, price(u,c,t) is zero

3.5 (![passing]) `[price_compact_left]`:
if price(u,c,t1) is set and price(u,c,t1-dateOffset) is not,
then for all t < t1, price(u,c,t) is zero

3.6 Discussion. The spacing, `compact_left`, and `compact_right` rules are intended
to capture the following more complex inveriant: if price(u,c,t1) and
price(u,c,t2) are nonzero then so is price(u,c,t) for every epoch boundary t
in the interval [t1,t2].

### State evolution

The changes to the state variables described above can only happen as follows:

4. Owner evolution: if the owner variable changes, then:
   4.1 (![passing]) `[owner_initialize_only]` it was changed to the sender of an `initialize` call
   4.2 (![passing]) `[owner_single_definition]` it was previously undefined (zero)

5. dateOffset evolution: if the dateOffset variable changes, then:
   5.1 (![passing]) `[dateOffset_transition]` it was changed to `d` by a call to `initialize(d)`
   5.2 (![passing]) `[dateOffset_single_definition]` it was previously undefined (zero)

6. oracle evolution: if oracle(u,c) changes, then:
   6.1 (![passing]) `[oracle_valid_change]` it is changed to o by a call by the owner to addTokenPair(u,c,o)
   6.2 (![passing]) `[oracle_single_definition]` it was previously undefined (zero)

7. price evolution: if price(u,c,t) changes, then:
   7.1 (![passing]) `[price_single_edit]`: it was previously undefined (zero)
   7.2 (![passing]) `[price_accurate]`: it was changed to match result of a call to oracle(u,c).latestData
   7.3 (![passing]) `[price_bounded_past]`: t is in the past
   7.4 (![passing]) `[price_t0_constant]`: there are no t' > t with nonzero price(u,c,t')
   7.5 (![passing]) `[price_authorized_only]`: it was changed by either setSettlementPrice, setSettlementPriceForDate, or addTokenPair
