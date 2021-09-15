
if [ -z "$2" ]
  then
    echo "No message given!"
    echo "Usage: (from git root)"
    echo "./certora/scripts/`basename $0` [rule name] [message describing the run]"
    exit 1
  fi

make -C certora munged

certoraRun certora/harness/SeriesControllerHarness.sol \
  certora/harness/DummyERC20A.sol certora/harness/DummyERC20B.sol \
  certora/harness/DummyERC1155Receiver.sol certora/harness/DummyERC1155ReceiverReject.sol \
  certora/munged/series/ERC1155Controller.sol  certora/munged/series/SeriesVault.sol \
  --link SeriesControllerHarness:vault=SeriesVault \
  --link SeriesControllerHarness:erc1155Controller=ERC1155Controller \
  --verify SeriesControllerHarness:certora/seriesController.spec \
  --solc solc8.0 \
  --rule $1 \
  --short_output \
  --settings -postProcessCounterExamples=true,-t=600 \
  --loop_iter 2 --optimistic_loop \
  --packages @openzeppelin=node_modules/@openzeppelin @chainlink=node_modules/@chainlink  \
  --msg "SeriesControllerHarness $1 $2" --staging \


  # --solc_args "['--optimize', '--optimize-runs', '200']" \
  # --staging shelly/fix1396
  # --solc_args "['--optimize', '--optimize-runs', '200']" \
  
