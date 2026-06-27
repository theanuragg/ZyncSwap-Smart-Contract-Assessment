import { NextResponse } from "next/server";
import { getMarketEngine, getMatchingEngine } from "../../../../lib/engines.js";
import { quoteDp, formatPrice } from "../../../../lib/merge.js";
import { MatchError } from "../../../../lib/matchingEngine.js";

export const dynamic = "force-dynamic";

const SIDES = new Set(["buy", "sell"]);
const ORDER_TYPES = new Set(["limit", "market"]);
const MAX_ORDER_SIZE = 1_000_000_000;

function jsonError(message, status, details) {
  return NextResponse.json(
    { error: { message, ...(details ? { details } : {}) } },
    { status },
  );
}

function quoteDecimalsForQuote(quote) {
  switch (quote) {
    case "ETH": return 8;
    case "BTC": return 2;
    default: return 4;
  }
}
function orderToJson(o, decimals) {
  return {
    id: o.id, market_id: o.market_id, side: o.side, order_type: o.order_type,
    price: o.price == null ? null : formatPrice(o.price, decimals),
    size: o.size_original.toFixed(8), size_remaining: o.size_remaining.toFixed(8),
    status: o.status, created_at: o.created_at,
  };
}
function tradeToJson(t, decimals) {
  return {
    id: t.id, price: formatPrice(t.price, decimals), size: t.size.toFixed(8),
    maker_order_id: t.maker_order_id, taker_order_id: t.taker_order_id,
    taker_side: t.taker_side, ts: t.ts,
  };
}

function parsePositiveNumber(value, fieldName) {
  if (typeof value !== "number" && typeof value !== "string") {
    return { error: `${fieldName} must be a number` };
  }
  const n = typeof value === "number" ? value : Number.parseFloat(value.trim());
  if (!Number.isFinite(n) || n <= 0) {
    return { error: `${fieldName} must be a positive number` };
  }
  if (n > MAX_ORDER_SIZE) {
    return { error: `${fieldName} is too large` };
  }
  return { value: n };
}

function parseOrderBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "request body must be a JSON object" };
  }

  const marketId = String(body.market_id ?? body.marketId ?? "").trim().toLowerCase();
  if (!marketId) return { error: "market_id is required" };

  const side = String(body.side ?? "").trim().toLowerCase();
  if (!SIDES.has(side)) {
    return { error: "side must be buy or sell" };
  }

  const orderType = String(body.order_type ?? body.orderType ?? "").trim().toLowerCase();
  if (!ORDER_TYPES.has(orderType)) {
    return { error: "order_type must be limit or market" };
  }

  const size = parsePositiveNumber(body.size ?? body.sizeBase, "size");
  if (size.error) return { error: size.error };

  let price = null;
  const rawPrice = body.price ?? body.limitPrice;
  if (orderType === "limit") {
    const parsedPrice = parsePositiveNumber(rawPrice, "price");
    if (parsedPrice.error) return { error: "limit order requires a positive price" };
    price = parsedPrice.value;
  } else if (rawPrice != null && String(rawPrice).trim() !== "") {
    const parsedPrice = parsePositiveNumber(rawPrice, "price");
    if (parsedPrice.error) return { error: parsedPrice.error };
    price = parsedPrice.value;
  }

  return { order: { marketId, side, orderType, price, size: size.value } };
}

function parseVirtualLevels(levels) {
  return (levels ?? [])
    .map((level) => ({
      price: Number.parseFloat(level.price),
      size: Number.parseFloat(level.size),
    }))
    .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size) && level.price > 0 && level.size > 0);
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const marketId = searchParams.get("market_id") ?? undefined;
    const openOnly = searchParams.get("open_only") === "true" || searchParams.get("open_only") === "1";
    const list = await getMatchingEngine().listOrders(marketId, openOnly);
    let decimals = 8;
    if (marketId) {
      const d = getMarketEngine().detail(marketId.trim());
      decimals = d ? quoteDecimalsForQuote(d.quote) : 4;
    }
    return NextResponse.json({ orders: list.map((o) => orderToJson(o, decimals)) });
  } catch (e) {
    console.error("GET /api/v1/orders error:", e instanceof Error ? e.message : String(e));
    return jsonError("Internal server error", 500);
  }
}

export async function POST(req) {
  const authErr = requireApiKey(req);
  if (authErr) return authErr;
  const body = await req.json().catch(() => null);
  const parsed = parseOrderBody(body);
  if (parsed.error) return jsonError(parsed.error, 400);

  const { marketId, side, orderType, price, size } = parsed.order;
  const d = getMarketEngine().detail(marketId);
  if (!d) return jsonError(`unknown market_id: ${marketId}`, 404);
  const decimals = quoteDecimalsForQuote(d.quote);
  const now = Math.floor(Date.now() / 1000);
  const virtualBook = {
    asks: parseVirtualLevels(d.book?.asks).sort((a, b) => a.price - b.price),
    bids: parseVirtualLevels(d.book?.bids).sort((a, b) => b.price - a.price),
  };

  try {
    const { order, trades } = await getMatchingEngine().submit(marketId, side, orderType, price, size, now, { virtualBook });
    return NextResponse.json({ order: orderToJson(order, decimals), trades: trades.map((t) => tradeToJson(t, decimals)) });
  } catch (e) {
    if (e instanceof MatchError) {
      return jsonError(e.message, e.code === "BAD_REQUEST" ? 400 : 404);
    }
    console.error("POST /api/v1/orders unexpected error:", e instanceof Error ? e.message : String(e));
    return jsonError("Internal server error", 500);
  }
}
