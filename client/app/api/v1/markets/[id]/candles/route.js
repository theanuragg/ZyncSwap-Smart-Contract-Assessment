import { NextResponse } from "next/server";
import { getMarketEngine } from "../../../../../../lib/engines.js";
import { CandleValidationError, formatCandles, parseCandleQuery } from "../../../../../../lib/candles.js";

export const dynamic = "force-dynamic";

function jsonError(message, status) {
  return NextResponse.json({ error: { message } }, { status });
}

export function GET(req, { params }) {
  const id = String(params.id ?? "").trim().toLowerCase();
  if (!id) return jsonError("market id is required.", 400);

  let query;
  try {
    query = parseCandleQuery(new URL(req.url).searchParams);
  } catch (e) {
    if (e instanceof CandleValidationError) return jsonError(e.message, 400);
    throw e;
  }

  const market = getMarketEngine().detail(id);
  if (!market) return jsonError(`unknown market id: ${id}`, 404);

  const candles = getMarketEngine().candles(id, query.timeframe, query.limit);
  if (!candles) return jsonError(`unknown market id: ${id}`, 404);

  return NextResponse.json({
    market_id: id,
    timeframe: query.timeframe,
    limit: query.limit,
    candles: formatCandles(candles, market.quote),
  });
}
