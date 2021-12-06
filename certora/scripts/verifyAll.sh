sh certora/scripts/verifyERC1155Controller.sh       "run all"
sh certora/scripts/verifySeriesVault.sh             "run all"
sh certora/scripts/verifyPriceOracle.sh             "run all"

sh certora/scripts/verifySeriesController.sh seriesBalanceEQtokenBalance "run all"
sh certora/scripts/verifySeriesController.sh shareSum                    "run all"
sh certora/scripts/verifySeriesController.sh optionTokenSupply           "run all"
sh certora/scripts/verifySeriesController.sh noChangeToOtherSeries       "run all"
sh certora/scripts/verifySeriesController.sh exerciseOnlyOnExpired       "run all"
sh certora/scripts/verifySeriesController.sh noWithdrawOnOpen            "run all"
sh certora/scripts/verifySeriesController.sh noCloseOnExpired            "run all"
sh certora/scripts/verifySeriesController.sh noGain                      "run all"
sh certora/scripts/verifySeriesController.sh noDoubleExercise            "run all"

sh certora/scripts/verifySeriesController.sh seriesSolvency              "run all"

