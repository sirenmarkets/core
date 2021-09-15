# Running the certora verification tool

These instructions detail the process for running CVT on the SirenMarkets series
management contracts.

## Running the verification

Due to current time and space limitations in the tool, many of the rules need to
be verified separately, so there are many steps required to reverify everything.

The scripts in the `certora/scripts` directory are used to submit verification
jobs to the Certora verification service. These scripts should be run from the
root directory; for example by running

```sh
sh certora/scripts/verifySeriesVault.sh <arguments>
```

After the job is complete, the results will be available on
[the Certora portal](https://vaas-stg.certora.com/).

The `verifyAll` script contains a list of all the different verifications that
can be run. We don't recommend actually running this script, but it can be used
as a reference list for the invocations described below.

The `verifySeriesVault`, `verifyPriceOracle`, and `verifyERC1155Controller`
scripts run all of the rules for the corresponding contracts. These scripts
require an additional message argument which is displayed on the list of runs
and can be useful to disambiguate results when running with multiple different
configurations.

The SeriesController verification pushes the time and space limits that CVT can
handle in a single execution, so the `verifySeriesController` script requires
another argument indicating which rule should be run.

In fact, the `callSolvency` rule requires further subdivision: it must be run
separately on each method. The `filtered` statement in
`certora/seriesController.spec` specifies which method should be verified;
uncommenting the corresponding line corresponding to a method will cause that
method to be verified.

## Adapting to changes

Some of our rules require the code to be simplified in various ways. Our
primary tool for performing these simplifications is to run verification on a
contract that extends the original contracts and overrides some of the methods.
These "harness" contracts can be found in the `certora/harness` directory.

This pattern does require some modifications to the original code: some methods
need to be made virtual or public, for example. These changes are handled by
applying a patch to the code before verification.

When one of the `verify` scripts is executed, it first applies the patch file
`certora/applyHarness.patch` to the `contracts` directory, placing the output
in the `certora/munged` directory. We then verify the contracts in the
`certora/munged` directory.

If the original contracts change, it is possible to create a conflict with the
patch. In this case, the verify scripts will report an error message and output
rejected changes in the `munged` directory. After merging the changes, run
`make record` in the `certora` directory; this will regenerate the patch file,
which can then be checked into git.
