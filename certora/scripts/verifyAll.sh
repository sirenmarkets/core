sh certora/scripts/verifyERC1155Controller.sh       "run all" 2>&1 > certora/output/erc1155.out
sh certora/scripts/verifySeriesVault.sh             "run all" 2>&1 > certora/output/seriesVault.out
sh certora/scripts/verifyPriceOracle.sh             "run all" 2>&1 > certora/output/priceOracle.out

sh certora/scripts/verifySeriesController.sh seriesBalanceEQtokenBalance "run all" 2>&1 > certora/output/scSeriesBalanceEQtokenBalance.out
sh certora/scripts/verifySeriesController.sh shareSum                    "run all" 2>&1 > certora/output/scShareSum.out
sh certora/scripts/verifySeriesController.sh optionTokenSupply           "run all" 2>&1 > certora/output/scOptionTokenSupply.out
sh certora/scripts/verifySeriesController.sh noChangeToOtherSeries       "run all" 2>&1 > certora/output/scNoChangeToOtherSeries.out
sh certora/scripts/verifySeriesController.sh exerciseOnlyOnExpired       "run all" 2>&1 > certora/output/scExerciseOnlyOnExpired.out
sh certora/scripts/verifySeriesController.sh noWithdrawOnOpen            "run all" 2>&1 > certora/output/scNoWithdrawOnOpen.out
sh certora/scripts/verifySeriesController.sh noCloseOnExpired            "run all" 2>&1 > certora/output/scNoCloseOnExpired.out
sh certora/scripts/verifySeriesController.sh noGain                      "run all" 2>&1 > certora/output/scNoGain.out
sh certora/scripts/verifySeriesController.sh noDoubleExercise            "run all" 2>&1 > certora/output/scNoDoubleExercise.out

sh certora/scripts/verifySeriesController.sh seriesSolvency              "run all" 2>&1 > certora/output/scSeriesSolvency.out

