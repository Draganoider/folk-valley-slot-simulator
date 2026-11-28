// Written by `npm run analyse:panel` (src/worker/node/panel-report.ts). Do not edit by hand:
// tests/ui/stats.test.ts fails when this no longer equals analyse(FOLK_VALLEY_CONFIG).
import type { TheoreticalReport } from '../../engine';

export const THEORETICAL_REPORT: TheoreticalReport = {
  "label": "theoretical",
  "analyserVersion": "folk-valley-analyser-1",
  "configId": "folk-valley-96-v1",
  "costCoins": 20,
  "capCoins": 50000,
  "rtp": {
    "kind": "theoretical",
    "value": 0.9599727750099177
  },
  "rtpUncapped": {
    "kind": "theoretical",
    "value": 0.9599727750099264
  },
  "capReduction": {
    "kind": "theoretical",
    "value": 8.659739592076221e-15
  },
  "rtpSplit": {
    "kind": "theoretical",
    "value": {
      "baseWays": 0.5043961204247949,
      "trickLandings": 0.1822909420659325,
      "sessionFromFlyers": 0.07109285687336744,
      "sessionFromScarCard": 0.20219285564582581
    }
  },
  "rtpSplitByUplift": {
    "kind": "theoretical",
    "value": {
      "baseGame": 0.5548229953793214,
      "trickUplift": 0.13186406711140597,
      "session": 0.27328571251919326
    }
  },
  "sigma": {
    "kind": "theoretical",
    "value": 5.715258027072975
  },
  "sigmaLongRun": {
    "kind": "theoretical",
    "value": 5.044031717487767
  },
  "hitFrequency": {
    "kind": "theoretical",
    "value": 0.3115646606957224
  },
  "winAboveBetFrequency": {
    "kind": "theoretical",
    "value": 0.17189911286273976
  },
  "evenMoneyFrequency": {
    "kind": "theoretical",
    "value": 0
  },
  "ldwFrequency": {
    "kind": "theoretical",
    "value": 0.13966554783298266
  },
  "trickRate": {
    "kind": "theoretical",
    "value": 0.10497116293560961
  },
  "trickLandRate": {
    "kind": "theoretical",
    "value": 0.3
  },
  "sessionRate": {
    "kind": "theoretical",
    "value": 0.00708836258580549
  },
  "capProbability": {
    "kind": "theoretical",
    "value": 1.0445612488401445e-16
  },
  "maxWin": {
    "kind": "theoretical",
    "value": {
      "coins": 50000,
      "timesBet": 2500,
      "probability": 1.0445612488401445e-16
    }
  },
  "winDistribution": {
    "kind": "theoretical",
    "value": [
      {
        "bucket": "0",
        "probability": 0.6884353393042776
      },
      {
        "bucket": "(0, 1)",
        "probability": 0.13966554783298266
      },
      {
        "bucket": "[1, 2)",
        "probability": 0.08075563257518648
      },
      {
        "bucket": "[2, 5)",
        "probability": 0.0644374399767651
      },
      {
        "bucket": "[5, 10)",
        "probability": 0.01328865088509856
      },
      {
        "bucket": "[10, 20)",
        "probability": 0.007019077947637104
      },
      {
        "bucket": "[20, 50)",
        "probability": 0.004118063582457253
      },
      {
        "bucket": "[50, 100)",
        "probability": 0.0015959698396133997
      },
      {
        "bucket": "[100, 200)",
        "probability": 0.0005851988583421124
      },
      {
        "bucket": "[200, 500)",
        "probability": 0.00009695768723742045
      },
      {
        "bucket": "[500, 1000)",
        "probability": 0.000002108295183924308
      },
      {
        "bucket": "[1000, 2500)",
        "probability": 1.3215218316295042e-8
      },
      {
        "bucket": "2500+",
        "probability": 1.0445612488401445e-16
      }
    ]
  },
  "trickTiers": {
    "kind": "theoretical",
    "value": [
      {
        "id": "easy",
        "attemptProbability": 0.06298269776136577,
        "landProbability": 0.36,
        "meanWinWhenLanded": 4.066321211502987,
        "meanPlainWinWhenLanded": 1.6012929501873099,
        "wildReelSets": [
          {
            "reels": [
              2
            ],
            "probability": 0.34432864514823436
          },
          {
            "reels": [
              3
            ],
            "probability": 0.33593038551047255
          },
          {
            "reels": [
              4
            ],
            "probability": 0.31974096934129315
          }
        ]
      },
      {
        "id": "medium",
        "attemptProbability": 0.03149134888068288,
        "landProbability": 0.26,
        "meanWinWhenLanded": 8.132642423005974,
        "meanPlainWinWhenLanded": 1.6012929501873099,
        "wildReelSets": [
          {
            "reels": [
              2
            ],
            "probability": 0.34432864514823436
          },
          {
            "reels": [
              3
            ],
            "probability": 0.33593038551047255
          },
          {
            "reels": [
              4
            ],
            "probability": 0.31974096934129315
          }
        ]
      },
      {
        "id": "hard",
        "attemptProbability": 0.010497116293560961,
        "landProbability": 0.06,
        "meanWinWhenLanded": 37.31827531246501,
        "meanPlainWinWhenLanded": 1.6012929501873099,
        "wildReelSets": [
          {
            "reels": [
              2,
              3
            ],
            "probability": 0.3401295153293534
          },
          {
            "reels": [
              2,
              4
            ],
            "probability": 0.33203480724476375
          },
          {
            "reels": [
              3,
              4
            ],
            "probability": 0.3278356774258828
          }
        ]
      }
    ]
  },
  "sessions": {
    "kind": "theoretical",
    "value": [
      {
        "trigger": "flyers3",
        "startRung": 0,
        "rate": 0.001785589019044984,
        "meanWin": 38.525690461864414,
        "sdWin": 46.487231838383735,
        "meanSpins": 8.537775223933775,
        "painLimitProbability": 0.9391346889176801,
        "zeroProbability": 0.060996592162675986,
        "maxSpins": 14
      },
      {
        "trigger": "flyers4",
        "startRung": 1,
        "rate": 0.000053876825980271745,
        "meanWin": 42.18585306746609,
        "sdWin": 49.24780094738101,
        "meanSpins": 8.159333936620873,
        "painLimitProbability": 0.9485743462753948,
        "zeroProbability": 0.06953878143639008,
        "maxSpins": 14
      },
      {
        "trigger": "flyers5",
        "startRung": 2,
        "rate": 6.363404643339183e-7,
        "meanWin": 45.52149457201383,
        "sdWin": 51.8993191501065,
        "meanSpins": 7.825157884980371,
        "painLimitProbability": 0.9554181171170657,
        "zeroProbability": 0.07833858820184496,
        "maxSpins": 14
      },
      {
        "trigger": "scarCard",
        "startRung": 0,
        "rate": 0.0052482604003159,
        "meanWin": 38.525690461864414,
        "sdWin": 46.487231838383735,
        "meanSpins": 8.537775223933775,
        "painLimitProbability": 0.9391346889176801,
        "zeroProbability": 0.060996592162675986,
        "maxSpins": 14
      }
    ]
  },
  "scarCard": {
    "kind": "theoretical",
    "value": {
      "size": 14,
      "bailProbability": 0.07347981405492673,
      "bailWithFlyersProbability": 0.00005831530071900083,
      "stationary": [
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07142451934340477,
        0.07148124853573799
      ],
      "betLevels": [
        1,
        2,
        5,
        10,
        25
      ]
    }
  },
  "baseGame": {
    "kind": "theoretical",
    "value": {
      "rtp": 0.5548229953793198,
      "hitFrequency": 0.3078420624335993,
      "sigma": 1.3526630539747833
    }
  },
  "exact": {
    "rtpUncapped": {
      "numerator": "2834922033158604818871649960367759691196425840856806805791628107",
      "denominator": "2953127533360819369481875000000000000000000000000000000000000000",
      "value": 0.9599727750099264
    },
    "secondMomentUncappedCoins2": {
      "numerator": "409669448093283364231093408546322804490126197200329011829933486749246639447",
      "denominator": "30494315973509247797551691319450000000000000000000000000000000000000000",
      "value": 13434.28881792816
    },
    "trickRate": {
      "numerator": "29649",
      "denominator": "282449",
      "value": 0.10497116293560961
    },
    "sessionRate": {
      "numerator": "3113742179517693",
      "denominator": "439275240484028000",
      "value": 0.00708836258580549
    },
    "scarCardStationaryLast": {
      "numerator": "4111328",
      "denominator": "57516175",
      "value": 0.07148124853573799
    }
  },
  "floatError": {
    "relative": 9.29773746882745e-11,
    "sigmaAbsolute": 2.8068683303588234e-10,
    "sessionMeanCheck": 7.342450111623491e-14
  },
  "work": {
    "baseCells": 2890,
    "sessionSpinValues": 887,
    "ladderStates": 36,
    "milliseconds": 0
  }
};
