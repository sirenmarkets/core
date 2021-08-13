module.exports = {
  skipFiles: ["./test/MockPriceOracle.sol"],
  mocha: {
    grep: "Measures gas", // gas tests get distorted by solcover's instrumentation, so skip them
    invert: true, // Run the grep's inverse set.
  },
}
