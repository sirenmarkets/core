const dayPriceData = require("./uniswap_price_data.json")

// get last 31 days worth of price data
const NUM_DATA_POINTS = 31

// calculate historical volatility using price data from the uniswap subgraph
const calculateHistoricalVolatility = (dailyPriceData) => {
  const lastMonthsData = dailyPriceData
    .map((d) => parseFloat(d.priceUSD))
    .slice(dailyPriceData.length - NUM_DATA_POINTS, dayPriceData.length)
  const lastMonthsReturns = []
  // calculate each day's returns, by dividing the current day's price by the previous day's price
  for (let i = 1; i < lastMonthsData.length; i++) {
    const dailyReturn = lastMonthsData[i] / lastMonthsData[i - 1]
    lastMonthsReturns.push(dailyReturn)
  }

  const average =
    lastMonthsReturns.reduce((a, p) => a + p, 0) / lastMonthsReturns.length
  const squareDifferences = lastMonthsReturns.map((p) =>
    Math.pow(p - average, 2),
  )
  const summedSquareDifferences = squareDifferences.reduce((a, p) => a + p, 0)
  const variance = summedSquareDifferences / (lastMonthsReturns.length - 1)
  const annualVariance = variance * 365
  const stdDeviation = Math.sqrt(annualVariance)
  return stdDeviation
}

const iv = calculateHistoricalVolatility(dayPriceData)
console.log("Annual IV:", iv)
console.log(
  "volatilityFactor:",
  Math.ceil(((0.4 * iv) / Math.sqrt(365 * 24 * 60 * 60)) * 1e18),
)
