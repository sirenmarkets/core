import {
  now,
  getNextFriday8amUTCTimestamp,
  setupAllTestContracts,
  setupMockPriceOracle,
  assertBNEqWithTolerance,
} from "../util"

let axios = require("axios")
import { time, BN } from "@openzeppelin/test-helpers"
import { artifacts, contract, assert, ethers } from "hardhat"
import { expectRevert } from "@openzeppelin/test-helpers"
import { BigNumber } from "@ethersproject/bignumber"
import { BigNumber as BigNum } from "bignumber.js"
const { provider } = ethers
import {
  MockPriceOracleContract,
  SimpleTokenContract,
  SimpleTokenInstance,
} from "../../typechain"
import { parseUnits } from "ethers/lib/utils"

let deployedVolatilityOracle

const MockPriceOracle: MockPriceOracleContract =
  artifacts.require("MockPriceOracle")

const SimpleToken: SimpleTokenContract = artifacts.require("SimpleToken")

const wbtcDecimals = 8
const VOL_TOLERANCE = 2e6
/**
 * Testing MinterAmm volatility oracle updates
 */
contract("Volatility Oracle", (accounts) => {
  let priceToken: SimpleTokenInstance
  let underlyingToken: SimpleTokenInstance
  let deployedMockPriceOracle
  let nextFriday8amUTC: number
  let deployedPriceOracle

  let PERIOD = 86400

  const WINDOW_IN_DAYS = 90 // 3 month vol data
  const COMMIT_PHASE_DURATION = 3600 // 30 mins

  before(async () => {
    // Create a token for the underlying asset
    underlyingToken = await SimpleToken.new()
    await underlyingToken.initialize("Wrapped BTC", "WBTC", wbtcDecimals)

    // Create a token for the price asset, this is the asset the underlying is priced in
    priceToken = await SimpleToken.new()
    await priceToken.initialize("USD Coin", "USDC", 6)
  })

  beforeEach(async () => {
    // create the price oracle fresh for each test

    deployedPriceOracle = await MockPriceOracle.new(wbtcDecimals)
    const humanCollateralPrice2 = new BN(2000 * 10 ** 6) // 22k

    await deployedPriceOracle.setLatestAnswer(humanCollateralPrice2)

    deployedMockPriceOracle = await setupMockPriceOracle(
      underlyingToken.address,
      priceToken.address,
      deployedPriceOracle.address,
    )

    nextFriday8amUTC = getNextFriday8amUTCTimestamp(await now())

    const volatility = await ethers.getContractFactory("VolatilityOracle", {})

    deployedVolatilityOracle = await volatility.deploy(
      PERIOD,
      deployedMockPriceOracle.address,
      WINDOW_IN_DAYS,
    )
  })

  describe("initPool", () => {
    it("initializes pool", async function () {
      await expectRevert(
        deployedVolatilityOracle.commit(
          underlyingToken.address,
          priceToken.address,
        ),
        "!pool initialize",
      )

      await deployedVolatilityOracle.addTokenPair(
        underlyingToken.address,
        priceToken.address,
      )
    })

    it("reverts when pool has already been initialized", async function () {
      await deployedVolatilityOracle.addTokenPair(
        underlyingToken.address,
        priceToken.address,
      )
      await expectRevert(
        deployedVolatilityOracle.addTokenPair(
          underlyingToken.address,
          priceToken.address,
        ),
        "Pool initialized",
      )
    })
  })

  describe("Updates the vol", async () => {
    it("updates the vol", async function () {
      const values = [
        BigNumber.from("2000000000"),
        BigNumber.from("2100000000"),
        BigNumber.from("2200000000"),
        BigNumber.from("2150000000"),
      ]
      const stdevs = [
        BigNumber.from("0"),
        BigNumber.from("2439508"),
        BigNumber.from("2248393"),
        BigNumber.from("3068199"),
      ]
      let topOfPeriod1 = (await getTopOfPeriod()) + PERIOD
      await time.increaseTo(topOfPeriod1)

      await deployedVolatilityOracle.addTokenPair(
        underlyingToken.address,
        priceToken.address,
      )

      for (let i = 0; i < values.length; i++) {
        let value = parseUnits(values[i].toString())
        deployedPriceOracle.setLatestAnswer(value.toString())

        let topOfPeriod2 = (await getTopOfPeriod()) + PERIOD
        await time.increaseTo(topOfPeriod2)

        await deployedVolatilityOracle.commit(
          underlyingToken.address,
          priceToken.address,
        )
        let stdev = await deployedVolatilityOracle.vol(
          underlyingToken.address,
          priceToken.address,
        )
        assert.equal(await stdev.toString(), stdevs[i].toString())
      }
    })
  })

  describe("Checks the the vol against off chain tests", async () => {
    it("updates the vol over 4 sets of 90 days", async function () {
      let valueSet1 = [
        340.6160218128092, 341.4437964782809, 350.0556765681245,
        365.33944481939363, 370.4718109734285, 374.4970150925736,
        387.25555835657167, 381.16877389892255, 379.21025376092774,
        377.15868107868175, 365.9906423831468, 368.6504703636898,
        378.0493653237596, 379.6394773321801, 368.2270142350454,
        391.16674217757225, 413.2018903361906, 408.88948864371923,
        411.95921775305027, 406.157094148215, 393.38290839224464,
        403.529837833562, 388.87733988207765, 386.4460129872924,
        382.9007710380906, 385.8445887975079, 394.9363420491719,
        383.8498034220404, 387.616373722075, 401.7330968324722,
        415.9277704309719, 454.6515430984697, 435.4183540833094,
        455.3583669721691, 445.0512933420698, 449.8161845012962,
        463.18087172032307, 462.2056195794902, 475.9690936576015,
        462.7183970607933, 449.2068016397434, 461.3711967052673,
        482.1983847235396, 479.43766136247405, 471.31795839441156,
        508.79221458524455, 548.842116249849, 560.5088874583059,
        608.2733109189421, 602.6662623938871, 568.2751530404493,
        518.4670452162002, 517.5530264056014, 537.3926120944484,
        574.7511196548439, 612.2637856122055, 589.5818443540976,
        598.760610095824, 616.506661565682, 571.1904316349736,
        595.9194139680376, 601.9689349244918, 592.3865066820175,
        554.329674302381, 573.8953091099941, 560.4542654076048,
        545.9828352633687, 568.3587534073821, 590.3244403029342,
        585.5418949360015, 589.0668316450424, 635.9618893796135,
        644.0652701929779, 654.4204162965752, 659.3188076372094,
        639.5154368778184, 610.4270278980672, 634.9797234431858,
        587.9588954992439, 612.8796570505974, 626.4567387784558,
        636.7423171944997, 689.6598573269875, 732.9570292975275,
        735.5908981625738, 752.8559324490188, 738.6169381520413,
        730.1473402196374, 777.6960653039432, 967.0005967288458,
      ]

      await deployedVolatilityOracle.addTokenPair(
        underlyingToken.address,
        priceToken.address,
      )

      let onChainVol1 = await calculateVolOnChain(valueSet1)
      let offChainVol1 = parseInt(
        ((await calculateVolOffChain(valueSet1)) * 1e8).toString(),
      )

      console.log("Values 1", onChainVol1.toString())
      console.log("ValuesOffChain 1", offChainVol1)

      assertBNEqWithTolerance(
        onChainVol1.toString(),
        offChainVol1.toString(),
        VOL_TOLERANCE,
        "Off Chain and On Chain should not differ more than 2%",
      )
      let valueSet2 = [
        1025.6547675669035, 1103.3582516225742, 1208.5750928728885,
        1229.4713150147782, 1223.7296883535275, 1282.979575527323,
        1267.7310031512136, 1092.9143378806064, 1045.406815230412,
        1132.0155910164729, 1216.9147884634556, 1171.8600177046465,
        1234.6318700828049, 1229.379698072007, 1255.976691513213,
        1383.4840902277115, 1385.8529958752583, 1122.912432537305,
        1236.6834427536564, 1231.176379704471, 1392.5397634449737,
        1323.4295031020106, 1355.233724240999, 1253.141671558609,
        1328.773619066556, 1380.2842591352105, 1372.427228964234,
        1317.0474362291777, 1368.6644548123775, 1514.2251957516528,
        1661.000824367477, 1587.8008991859367, 1724.8569083393102,
        1683.941297865053, 1608.6405479857196, 1750.997553719215,
        1769.053533934599, 1739.164209004836, 1782.5088691218523,
        1841.1977507032907, 1810.8425457323726, 1804.9841464366498,
        1775.758351701864, 1782.5753090505934, 1845.5739221567521,
        1938.5694368074617, 1969.9797177628186, 1929.367692879665,
        1941.4267676797988, 1788.6152102806425, 1563.9246059011416,
        1628.391533792655, 1468.8601037286776, 1450.988746804119,
        1480.1295768477528, 1416.661552837565, 1570.3996896340539,
        1497.0891042633873, 1579.4271687603093, 1546.4996211167372,
        1539.0484290947375, 1661.9279698998157, 1727.463096224567,
        1837.5330305439452, 1869.3311016255, 1802.3110916881178,
        1826.0574768119818, 1770.9361793697751, 1927.7207203999014,
        1866.0715447008808, 1791.047851830107, 1808.5512173614395,
        1828.7548332342565, 1780.1596459528505, 1817.1329628084297,
        1817.8601431294944, 1790.3780747526928, 1686.8911971580417,
        1673.8591835627929, 1581.631055931366, 1587.2979641585232,
        1700.3668693581185, 1713.8378756834459, 1689.0367982059097,
        1817.626388088868, 1840.294951985396, 1915.8325358462234,
        1970.4711995232753, 2134.101788297294, 2016.6672472930366,
      ]

      let onChainVol2 = await calculateVolOnChain(valueSet2)
      let offChainVol2 = parseInt(
        ((await calculateVolOffChain(valueSet2)) * 1e8).toString(),
      )
      console.log("Values 2", onChainVol2.toString())
      console.log("ValuesOffChain 2", offChainVol2)

      assertBNEqWithTolerance(
        onChainVol2.toString(),
        offChainVol2.toString(),
        VOL_TOLERANCE,
        "Off Chain and On Chain should not differ more than 2%",
      )

      let valueSet3 = [
        2077.755212422407, 2097.7963827792596, 2115.0554517461082,
        1989.1480619041722, 2081.3540625398964, 2069.6677960855295,
        2142.7960653929085, 2150.2651427927744, 2142.476275865736,
        2304.3435163110134, 2429.6615277515734, 2514.1684155812304,
        2424.5538447081194, 2345.266962776132, 2245.7607533508544,
        2168.032726735651, 2324.2846872281943, 2373.501344298211,
        2426.0711497906045, 2364.2312036020908, 2212.8437976342047,
        2307.35532084471, 2532.3868028851084, 2647.158189660288,
        2748.7845851218613, 2757.497552304977, 2776.70371169874,
        2944.9169473185057, 2953.2973480804735, 3439.8550695192603,
        3245.663148933579, 3524.562728476055, 3495.0758690360576,
        3493.534500000208, 3912.7429165968124, 3932.754068170969,
        3979.6086519212827, 4182.790285752286, 3906.108903329409,
        3750.3415950592753, 4088.73170832043, 3659.9218442136184,
        3602.0048969299023, 3288.2298872378637, 3399.0492796569383,
        2505.014945945662, 2778.279660560299, 2419.1032171150196,
        2306.371266867117, 2120.0373745099428, 2640.1596323488234,
        2695.4778071496326, 2882.483407624011, 2742.990862697615,
        2433.328865728611, 2294.626285512794, 2395.8532280027384,
        2708.429865793973, 2632.6565998696506, 2717.1540367097723,
        2858.27670209791, 2694.4976666790503, 2624.7689150594238,
        2711.5479390111605, 2580.5355800598445, 2528.022300878691,
        2620.6253893038547, 2486.600068788676, 2356.6347741896757,
        2379.991747950219, 2517.771695525423, 2587.381610979154,
        2561.1883309320033, 2365.872786190649, 2380.744519633922,
        2231.554315497782, 2176.308536317709, 2251.5605593660407,
        1900.1222998935382, 1875.3576944712033, 1971.1059779809414,
        1990.0761511910587, 1833.4631609981645, 1817.047665540675,
        1973.9268648383472, 2087.5187237874175, 2169.400067865984,
        2279.354161419647, 2121.657900633364, 2157.880584866453,
      ]

      let onChainVol3 = await calculateVolOnChain(valueSet3)
      let offChainVol3 = parseInt(
        ((await calculateVolOffChain(valueSet3)) * 1e8).toString(),
      )
      console.log("Values 3", onChainVol3.toString())
      console.log("ValuesOffChain 3", offChainVol3)

      assertBNEqWithTolerance(
        onChainVol3.toString(),
        offChainVol3.toString(),
        VOL_TOLERANCE,
        "Off Chain and On Chain should not differ more than 2%",
      )

      let valueSet4 = [
        2228.532398568573, 2329.004750998825, 2217.3018530598792,
        2320.6549288317, 2317.23694270242, 2126.4424673902267,
        2156.5809569525845, 2123.0585974934124, 2144.0142572722566,
        2042.4991866143628, 1944.3950166372085, 1997.6633136705987,
        1910.7269516309964, 1874.2002496808186, 1899.8427500663568,
        1905.723382843169, 1824.929392091902, 1794.973425186835,
        2003.7239214521073, 2027.5334479167045, 2117.154607794504,
        2183.627414557696, 2209.4993601030114, 2230.212067673471,
        2292.579636803809, 2299.689405936291, 2383.443259961735,
        2462.3999826480103, 2541.674599365905, 2555.408178513038,
        2611.6730699481845, 2521.268474889094, 2724.5322427136302,
        2821.649692746136, 2888.7322742752317, 3151.2175169176753,
        3012.3085592702105, 3163.0646551948857, 3147.842995401753,
        3166.6472179679286, 3048.4126816864195, 3323.19799054098,
        3268.5481770314927, 3309.7549104132368, 3153.583683763619,
        3007.1440271712713, 3037.230251196439, 3144.8184367851927,
        3276.9698366433354, 3224.0004601521537, 3243.4863583537394,
        3320.4091697810586, 3177.6637963046905, 3231.4414517287996,
        3122.971797237849, 3267.539434750998, 3245.430222387629,
        3233.383151693551, 3232.7338632854617, 3440.5623358869034,
        3790.6139962215557, 3793.3007433464186, 3936.1633916244464,
        3894.937511605067, 3950.270344526561, 3943.256785301908,
        3440.3417568365676, 3496.859022996073, 3435.97993265133,
        3209.915696090501, 3268.1041621348804, 3417.839366766938,
        3301.186776828727, 3425.2508733748823, 3595.9625714292315,
        3573.3075160249905, 3412.177182421673, 3427.58426153173,
        3335.884886514119, 2977.3226793404747, 2744.1109995297,
        3074.119761245824, 3159.269865581771, 2930.7427060738946,
        2946.9708461401983, 3063.31634471348, 2939.742282853775,
        2798.9844172601042, 2855.6117305265157, 3013.4932320320772,
      ]

      let onChainVol4 = await calculateVolOnChain(valueSet4)
      let offChainVol4 = parseInt(
        ((await calculateVolOffChain(valueSet4)) * 1e8).toString(),
      )
      console.log("Values 4", onChainVol4.toString())
      console.log("ValuesOffChain 4", offChainVol4)

      assertBNEqWithTolerance(
        onChainVol4.toString(),
        offChainVol4.toString(),
        VOL_TOLERANCE,
        "Off Chain and On Chain should not differ more than 2%",
      )

      let valueSet5 = [
        3305.107041443724, 3393.9242492696653, 3426.387080851377,
        3390.310407759615, 3520.3422566393974, 3592.1761295000256,
        3594.918357967647, 3558.549577083409, 3588.0809215501645,
        3431.0193069150096, 3537.840087124068, 3498.1052921206597,
        3605.6503342981764, 3794.516888224821, 3885.641764529699,
        3854.498461449342, 3854.223686940845, 3752.61872738495,
        3884.5872952429017, 4170.107932886265, 4074.8601575202883,
        3990.711976433473, 4179.44229816945, 4094.9389934187225,
        4230.208371594039, 4152.570288731245, 3944.090861781322,
        4288.09721878663, 4422.940535593754, 4324.6099257118785,
        4292.04047236198, 4330.553151595248, 4596.59309058429,
        4607.699273078144, 4550.014435142697, 4494.80276090967,
        4527.104154150622, 4626.6292884486975, 4815.004634322234,
        4742.08091060724, 4641.528764849704, 4732.9244503493555,
        4685.10635551733, 4666.498498194288, 4652.947394238871,
        4583.211418759011, 4243.352906802173, 4302.804958962834,
        3993.846595161859, 4317.603195646166, 4436.192766930451,
        4319.361566856902, 4101.062876490145, 4355.420957796475,
        4269.437219728043, 4515.843300142739, 4048.3128440761725,
        4084.0884856959556, 4290.091862536401, 4444.528279821561,
        4637.121616831405, 4589.610617539151, 4519.441028028784,
        4240.155516808957, 4101.656791810778, 4198.572874562462,
        4347.615630598069, 4310.566646424531, 4431.540647139759,
        4153.333310724186, 3918.200743402953, 4079.814930569866,
        4135.841510137412, 3782.8952622347147, 3858.1644681806974,
        4015.72254331389, 3971.5597663421136, 3886.7473617182886,
        3966.4253516705508, 3928.8417238716206, 3950.4823919860964,
        4036.549717813428, 3992.5945766373156, 4113.529931874606,
        4055.1173669313243, 4110.571870853741, 4075.03161894955,
        4045.051350119327, 3807.3603674991996, 3644.405516878227,
      ]

      let onChainVol5 = await calculateVolOnChain(valueSet5)
      let offChainVol5 = parseInt(
        ((await calculateVolOffChain(valueSet5)) * 1e8).toString(),
      )
      console.log("Values 5", onChainVol5.toString())
      console.log("ValuesOffChain 5", offChainVol5)

      assertBNEqWithTolerance(
        onChainVol5.toString(),
        offChainVol5.toString(),
        VOL_TOLERANCE,
        "Off Chain and On Chain should not differ more than 2%",
      )
    }).timeout(10000000)
  }).timeout(10000000)
  const getTopOfPeriod = async () => {
    const latestTimestamp = (await provider.getBlock("latest")).timestamp
    let topOfPeriod: number

    const rem = latestTimestamp % PERIOD
    if (rem < Math.floor(PERIOD / 2)) {
      topOfPeriod = latestTimestamp - rem + PERIOD
    } else {
      topOfPeriod = latestTimestamp + rem + PERIOD
    }
    return topOfPeriod
  }

  async function calculateVolOnChain(vals) {
    for (let i = 0; i < vals.length; i++) {
      let value = parseUnits(vals[i].toString())
      deployedPriceOracle.setLatestAnswer(value.toString())
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD
      await time.increaseTo(topOfPeriod)

      await deployedVolatilityOracle.commit(
        underlyingToken.address,
        priceToken.address,
      )
    }
    return await deployedVolatilityOracle.annualizedVol(
      underlyingToken.address,
      priceToken.address,
    )
  }

  async function calculateVolOffChain(vals) {
    let SDV = []
    for (let i = 0; i < vals.length - 1; i++) {
      let value = vals[i]
      SDV.push(Math.log(vals[i + 1] / value))
    }
    return getStandardDeviation(SDV)
  }
  function getStandardDeviation(array) {
    const n = array.length
    const mean = array.reduce((a, b) => a + b) / n
    return (
      Math.sqrt(
        array.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n,
      ) * 19.1049731745
    )
  }
})
