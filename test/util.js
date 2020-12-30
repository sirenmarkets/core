/** Contains shared logic to be used across tests */
const { BN } = require("@openzeppelin/test-helpers")

module.exports = {
  MarketStyle: {
    EUROPEAN_STYLE: 0,
    AMERICAN_STYLE: 1,
  },
  // humanPrice * 1e18 * 10 ** paymentDecimals / 10 ** collateralDecimals
  // 0.000066666666667 * 1e18 * 1e8 / 1e6 = 6.6666667e+15
  // humanPrice = 1e8 / oraclePrice
  // getCurrentCollateralPrice = 1e8 / oraclePrice * 1e18 * 10 ** paymentDecimals / 10 ** collateralDecimals
  getPriceRatio: (
    humanPrice,
    collateralDecimals,
    paymentDecimals,
    inverted = false,
  ) => {
    if (inverted) {
      return new BN(10)
        .pow(new BN(18))
        .mul(new BN(10).pow(new BN(paymentDecimals)))
        .div(new BN(10).pow(new BN(collateralDecimals)))
        .div(new BN(humanPrice))
    } else {
      return new BN(humanPrice)
        .mul(new BN(10).pow(new BN(18)))
        .mul(new BN(10).pow(new BN(paymentDecimals)))
        .div(new BN(10).pow(new BN(collateralDecimals)))
    }
  },
  checkBalances: async (
    account,
    accountName,
    collateralToken,
    paymentToken,
    bToken,
    wToken,
    lpToken,
    collateralBalance,
    paymentBalance,
    bBalance,
    wBalance,
    lpBalance,
  ) => {
    assert.equal(
      await collateralToken.balanceOf.call(account),
      collateralBalance, // > LP made 184 collateral profit
      `${accountName} should have correct collateralToken balance`,
    )

    assert.equal(
      await paymentToken.balanceOf.call(account),
      paymentBalance,
      `${accountName} should have correct paymentToken balance`,
    )

    assert.equal(
      await bToken.balanceOf.call(account),
      bBalance,
      `${accountName} should have correct bToken balance`,
    )

    assert.equal(
      await wToken.balanceOf.call(account),
      wBalance,
      `${accountName} should have correct wToken balance`,
    )

    assert.equal(
      await lpToken.balanceOf.call(account),
      lpBalance,
      `${accountName} should have correct lpToken balance`,
    )
  },

  checkBNsWithinTolerance: (expectedBN, actualBN, tolerance, errMsg) => {
    assert(
      expectedBN.lte(actualBN.add(tolerance)),
      `${errMsg}: expected: ${expectedBN.toString()} actual: ${actualBN.toString()}`,
    )
    assert(
      expectedBN.gte(actualBN.sub(tolerance)),
      `${errMsg}: expected: ${expectedBN.toString()} actual: ${actualBN.toString()}`,
    )
  },
}
