if [ -z "$1" ]
  then
    echo "No message given!"
  echo "Usage: (from git root)"
  echo "./certora/scripts/`basename $0` \"message describing the run\""
  exit 1
fi

make -C certora munged

certoraRun  certora/harness/ERC1155ControllerHarness.sol \
  certora/harness/DummyERC1155Receiver.sol certora/harness/DummyERC1155ReceiverReject.sol \
  --verify ERC1155ControllerHarness:certora/ERC1155Controller.spec \
  --solc solc8.0 \
  --solc_args "['--optimize', '--optimize-runs', '200']" \
  --short_output \
  --loop_iter 4 --optimistic_loop \
  --settings -postProcessCounterExamples=true,-enableStorageAnalysis=true \
  --packages @openzeppelin=node_modules/@openzeppelin @chainlink=node_modules/@chainlink \
  --msg "ERC1155Controller" --staging\

  # Removed to try and get ghosts to work 
