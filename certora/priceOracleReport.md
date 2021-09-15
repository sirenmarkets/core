# PriceOracle Contract

TODO: add rule status

✔️
🔁
✍

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

- TODO: we have only verified with certain values of loop unrolling; since SM
  is worried about the loop in `setSettlementPrice` and compactness
  invariants, we should either remove or explain and justify these assumptions.

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

1. Initialization
   1.1 `[ dateOffset_inititalization]` dateOffset is nonzero if and only if initialized
   1.2 `[ owner_inititalization]` owner is nonzero if and only if initialized
   1.3 `[ oracles_inititalization]` oracle(u,c) is zero if uninitialized
   1.4 `[ price_inititalization]` price(u,c,t) is zero if uninitialized

2. Date Offset
   2.1 `[dateOffset_value]` if initialized, the dateOffset is either 1 day or 1 week

3. Prices
   3.1 `[price_domain]`
   price(u,c) is only nonzero if (u,c) has an oracle

3.2 `[price_nontrivial]`
if (u,c) has an oracle
then there exists t with nonzero price(u,c,t)

3.3 `[price_spacing]`
if price(u,c,t1) and price(u,c,t2) are nonzero
then t1 and t2 differ by at least an epoch

3.4 `[price_compact_right]`:
if price(u,c,t1) is set and price(u,c,t1+dateOffset) is not,
then for all t > t1, price(u,c,t) is zero

3.5 `[price_compact_left]`:
if price(u,c,t1) is set and price(u,c,t1-dateOffset) is not,
then for all t < t1, price(u,c,t) is zero

3.6 Discussion. The spacing, `compact_left`, and `compact_right` rules are intended
to capture the following more complex inveriant: if price(u,c,t1) and
price(u,c,t2) are nonzero then so is price(u,c,t) for every epoch boundary t
in the interval [t1,t2].

### State evolution

The changes to the state variables described above can only happen as follows:

4. Owner evolution: if the owner variable changes, then:
   4.1 `[owner_initialize_only]` it was changed to the sender of an `initialize` call
   4.2 `[owner_single_definition]` it was previously undefined (zero)

5. dateOffset evolution: if the dateOffset variable changes, then:
   5.1 `[dateOffset_transition]` it was changed to `d` by a call to `initialize(d)`
   5.2 `[dateOffset_single_definition]` it was previously undefined (zero)

6. oracle evolution: if oracle(u,c) changes, then:
   6.1 `[oracle_valid_change]` it is changed to o by a call by the owner to addTokenPair(u,c,o)
   6.2 `[oracle_single_definition]` it was previously undefined (zero)

7. price evolution: if price(u,c,t) changes, then:
   7.1 `[price_single_edit]`: it was previously undefined (zero)
   7.2 `[price_accurate]`: it was changed to match result of a call to oracle(u,c).latestData
   7.3 `[price_bounded_past]`: t is in the past
   7.4 `[price_t0_constant]`: there are no t' > t with nonzero price(u,c,t')
   7.5 `[price_authorized_only]`: it was changed by either setSettlementPrice, setSettlementPriceForDate, or addTokenPair

### Method specifications

The above rules are "safety properties": they ensure that the state can only
change in prescribed ways. The following rules are "liveness properties": they
ensure that it is possible to call methods and that those methods have the
appropriate effects.

TODO
