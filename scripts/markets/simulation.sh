#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Executes cleanup function at script exit.
# trap cleanup EXIT

cleanup() {
  # Kill the ganache instance that we started (if we started one and if it's still running).
  if [ -n "$ganache_pid" ] && ps -p $ganache_pid > /dev/null; then
    kill -9 $ganache_pid
  fi
}

# start ganache-cli listening on port 8545 so we can use a local EVM for testing
node_modules/.bin/ganache-cli -m "$(cat .secret)" &

# set the process ID of ganache-cli so we know what ID to kill in `cleanup`
ganache_pid=$!

# now run the tests
node_modules/.bin/truffle migrate && node_modules/.bin/truffle exec scripts/markets/simulation.js

wait $ganache_pid