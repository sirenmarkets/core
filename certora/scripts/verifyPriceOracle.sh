if [ -z "$1" ]
  then
    echo "No message given!"
    echo "Usage: (from git root)"
    echo "./certora/scripts/`basename $0` \"message describing the run\""
    exit 1
fi

make -C certora munged

certoraRun certora/harness/PriceOracleHarness.sol \
  certora/harness/Oracle.sol \
  --verify PriceOracleHarness:certora/priceOracle.spec \
  --solc solc8.0 \
  --settings -t=60,-postProcessCounterExamples=true,-enableStorageAnalysis=true \
  --loop_iter 1 --optimistic_loop \
  --packages @openzeppelin=node_modules/@openzeppelin @chainlink=node_modules/@chainlink \
  --msg "PriceOracle $1" --staging
