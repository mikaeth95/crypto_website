import type { Candle, LiveChartIndicatorId } from "../types/market";

export type ChartIndicatorLine = {
  id: string;
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle?: 0 | 1 | 2 | 3 | 4;
  data: Array<{ time: number; value: number }>;
};

const buildSimpleMovingAverage = (candles: Candle[], period: number) => {
  const data: Array<{ time: number; value: number }> = [];

  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1);
    const sum = window.reduce((total, candle) => total + candle.close, 0);

    data.push({
      time: candles[index].time,
      value: sum / period,
    });
  }

  return data;
};

const buildExponentialMovingAverage = (candles: Candle[], period: number) => {
  if (candles.length < period) {
    return [];
  }

  const smoothingFactor = 2 / (period + 1);
  const seedWindow = candles.slice(0, period);
  let previousEma = seedWindow.reduce((total, candle) => total + candle.close, 0) / period;
  const data: Array<{ time: number; value: number }> = [
    {
      time: candles[period - 1].time,
      value: previousEma,
    },
  ];

  for (let index = period; index < candles.length; index += 1) {
    previousEma = candles[index].close * smoothingFactor + previousEma * (1 - smoothingFactor);
    data.push({
      time: candles[index].time,
      value: previousEma,
    });
  }

  return data;
};

const buildBollingerBands = (candles: Candle[], period: number, deviationMultiplier: number) => {
  const middle = buildSimpleMovingAverage(candles, period);

  return middle.reduce(
    (bands, point, index) => {
      const window = candles.slice(index, index + period);
      const variance =
        window.reduce((total, candle) => total + (candle.close - point.value) ** 2, 0) / period;
      const standardDeviation = Math.sqrt(variance);

      bands.upper.push({
        time: point.time,
        value: point.value + standardDeviation * deviationMultiplier,
      });
      bands.middle.push(point);
      bands.lower.push({
        time: point.time,
        value: point.value - standardDeviation * deviationMultiplier,
      });

      return bands;
    },
    {
      upper: [] as Array<{ time: number; value: number }>,
      middle: [] as Array<{ time: number; value: number }>,
      lower: [] as Array<{ time: number; value: number }>,
    },
  );
};

export const buildIndicatorLines = (
  candles: Candle[],
  indicators: LiveChartIndicatorId[],
): ChartIndicatorLine[] => {
  const lines: ChartIndicatorLine[] = [];

  indicators.forEach((indicator) => {
    switch (indicator) {
      case "sma_20":
        lines.push({
          id: "sma_20",
          color: "#38bdf8",
          lineWidth: 2,
          data: buildSimpleMovingAverage(candles, 20),
        });
        break;
      case "sma_50":
        lines.push({
          id: "sma_50",
          color: "#22c55e",
          lineWidth: 2,
          data: buildSimpleMovingAverage(candles, 50),
        });
        break;
      case "ema_20":
        lines.push({
          id: "ema_20",
          color: "#f97316",
          lineWidth: 2,
          data: buildExponentialMovingAverage(candles, 20),
        });
        break;
      case "ema_50":
        lines.push({
          id: "ema_50",
          color: "#a855f7",
          lineWidth: 2,
          data: buildExponentialMovingAverage(candles, 50),
        });
        break;
      case "ema_200":
        lines.push({
          id: "ema_200",
          color: "#facc15",
          lineWidth: 2,
          data: buildExponentialMovingAverage(candles, 200),
        });
        break;
      case "bollinger_20": {
        const bollingerBands = buildBollingerBands(candles, 20, 2);

        lines.push(
          {
            id: "bollinger_20_upper",
            color: "#f59e0b",
            lineWidth: 1,
            lineStyle: 2,
            data: bollingerBands.upper,
          },
          {
            id: "bollinger_20_middle",
            color: "#f59e0b",
            lineWidth: 1,
            data: bollingerBands.middle,
          },
          {
            id: "bollinger_20_lower",
            color: "#f59e0b",
            lineWidth: 1,
            lineStyle: 2,
            data: bollingerBands.lower,
          },
        );
        break;
      }
    }
  });

  return lines;
};
