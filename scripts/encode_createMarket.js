const MarketsRegistryABI = require("../build/contracts/MarketsRegistry.json")
  .abi
const { getPriceRatio } = require("../test/util")

function run() {
  const contract = new web3.eth.Contract(MarketsRegistryABI)

  const isForPut = false
  const isMainnet = false
  const humanPrice = 60000
  const expirationDate = 1613462400

  let marketName
  let collateral
  let payment
  let priceRatio
  let amm
  let optionSymbol
  if (isMainnet) {
    if (isForPut) {
      collateral = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
      payment = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
      priceRatio = getPriceRatio(humanPrice, 6, 8, true).toString()
      amm = "0x25bc339170adbff2b7b9ede682072577fa9d96e8"
      optionSymbol = "P"
    } else {
      collateral = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
      payment = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
      priceRatio = getPriceRatio(humanPrice, 8, 6).toString()
      amm = "0x87a3ef113c210ab35afebe820ff9880bf0dd4bfc"
      optionSymbol = "C"
    }
  } else {
    if (isForPut) {
      collateral = "0x7048c766c16c8ed9b8b4664e6da18197c9125e41"
      payment = "0x78d255da735b254f5573cfd1e0c0244ecf5c4441"
      priceRatio = getPriceRatio(humanPrice, 6, 8, true).toString()
      amm = "0x8eb27b89509c4f0012664f756823d407cfcfee02"
      optionSymbol = "P"
    } else {
      collateral = "0x78d255da735b254f5573cfd1e0c0244ecf5c4441"
      payment = "0x7048c766c16c8ed9b8b4664e6da18197c9125e41"
      priceRatio = getPriceRatio(humanPrice, 8, 6).toString()
      amm = "0x939295ad90e7cfad94b5224d91868baec341dd45"
      optionSymbol = "C"
    }
  }
  const { year, month, day } = parseDateComponents(expirationDate)
  const dateString = `${year}${month}${day}`
  marketName = `USDC.WBTC.${dateString}.${optionSymbol}.${humanPrice.toString()}`

  const args = [
    marketName,
    collateral,
    payment,
    1,
    priceRatio,
    expirationDate,
    0,
    0,
    0,
    amm,
  ]
  console.log(`is mainnet: ${isMainnet}`)
  console.log(args)
  console.log(contract.methods.createMarket(...args).encodeABI())
}

const parseDateComponents = (expirationDate) => {
  const d = new Date(expirationDate * 1000)
  if (
    d.getTime() < new Date("2021-02-15T00:00:00.000Z").getTime() ||
    d.getTime() > new Date("5000-02-15T00:00:00.000Z").getTime()
  ) {
    throw new Error("expirationDate must be in units of seconds after epoch")
  }

  const year = d.getUTCFullYear()
  const monthUnpadded = (d.getUTCMonth() + 1).toString()
  const month = monthUnpadded.length == 1 ? "0" + monthUnpadded : monthUnpadded
  const dayUnpadded = d.getUTCDate()
  const day = dayUnpadded.length == 1 ? "0" + dayUnpadded : dayUnpadded

  return {
    year,
    month,
    day,
  }
}

module.exports = async (callback) => {
  try {
    run()
    callback()
  } catch (e) {
    callback(e)
  }
}
