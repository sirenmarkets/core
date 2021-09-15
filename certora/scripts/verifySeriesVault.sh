if [ -z "$1" ]
  then
    echo "No message given!"
    echo "Usage: (from git root)"
    echo "./certora/scripts/`basename $0` \"message describing the run\""
    exit 1
fi

make -C certora munged

certoraRun certora/munged/series/SeriesVault.sol \
  certora/harness/DummyERC20A.sol \
  certora/munged/series/ERC1155Controller.sol \
  --verify SeriesVault:certora/SeriesVault.spec \
  --solc solc8.0 \
  --settings -postProcessCounterExamples=true,-enableStorageAnalysis=true \
  --loop_iter 1 --optimistic_loop \
  --packages @openzeppelin=node_modules/@openzeppelin @chainlink=node_modules/@chainlink \
  --msg "SeriesVault $1" --staging
