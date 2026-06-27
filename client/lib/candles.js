import { formatPrice, quoteDp } from "./merge.js";

export const CANDLE_TIMEFRAMES = ["1m", "5m", "15m", "1h"];
export const MAX_CANDLE_LIMIT = 500;
export const DEFAULT_CANDLE_LIMIT = 100;

/**
 * @typedef {{
 *   timestamp: number;
 *   open: string;
 *   high: string;
 *   low: string;
 *   close: string;
 *   volume: string;
 * }} PublicCandle
 */

export class CandleValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CandleValidationError";
  }
}

export function parseCandleQuery(searchParams) {
  const timeframe = searchParams.get("timeframe") ?? "5m";
  if (!CANDLE_TIMEFRAMES.includes(timeframe)) {
    throw new CandleValidationError(
      `Unsupported timeframe: ${timeframe}. Allowed: ${CANDLE_TIMEFRAMES.join(", ")}.`,
    );
  }

  const rawLimit = searchParams.get("limit");
  if (rawLimit == null || rawLimit.trim() === "") {
    return { timeframe, limit: DEFAULT_CANDLE_LIMIT };
  }

  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new CandleValidationError("limit must be a positive integer.");
  }
  if (limit > MAX_CANDLE_LIMIT) {
    throw new CandleValidationError(`limit must be less than or equal to ${MAX_CANDLE_LIMIT}.`);
  }
  return { timeframe, limit };
}

export function formatCandles(candles, quote) {
  const priceDecimals = quoteDp(quote);
  return candles.map((c) => ({
    timestamp: c.t * 1000,
    open: formatPrice(c.o, priceDecimals),
    high: formatPrice(c.h, priceDecimals),
    low: formatPrice(c.l, priceDecimals),
    close: formatPrice(c.c, priceDecimals),
    volume: c.v.toFixed(4),
  }));
}
