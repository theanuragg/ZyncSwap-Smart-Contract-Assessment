import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import { createMatchingEngine, MatchError } from "../client/lib/matchingEngine.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function freshEngine() {
  const tmp = mkdtempSync(join(tmpdir(), "me-test-"));
  const stateFile = join(tmp, "state.json");
  writeFileSync(stateFile, JSON.stringify({ orders: [], trades: [], next_trade_id: 1 }));
  const engine = createMatchingEngine(stateFile);
  return { engine, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

const TIMENOW = 1_700_000_000;

describe("MatchingEngine", () => {
  let ctx;
  let engine;

  before(() => {
    ctx = freshEngine();
    engine = ctx.engine;
  });

  after(() => ctx.cleanup());

  it("submits a market buy that fills against virtual liquidity", async () => {
    const virtualBook = {
      asks: [{ price: 100, size: 10 }, { price: 101, size: 5 }],
      bids: [],
    };
    const { order, trades } = await engine.submit("btc-usdt", "buy", "market", null, 5, TIMENOW, { virtualBook });
    expect(order.status).to.equal("filled");
    expect(order.size_remaining).to.equal(0);
    expect(trades.length).to.be.at.least(1);
    for (const t of trades) {
      expect(t.taker_side).to.equal("buy");
      expect(t.market_id).to.equal("btc-usdt");
    }
  });

  it("submits a market sell that fills against virtual liquidity", async () => {
    const virtualBook = {
      asks: [],
      bids: [{ price: 99, size: 8 }, { price: 98, size: 4 }],
    };
    const { order, trades } = await engine.submit("eth-usdt", "sell", "market", null, 6, TIMENOW, { virtualBook });
    expect(order.status).to.equal("filled");
    expect(trades.length).to.be.at.least(1);
    for (const t of trades) {
      expect(t.taker_side).to.equal("sell");
    }
  });

  it("submits a limit buy that stays open if above the ask", async () => {
    const virtualBook = {
      asks: [{ price: 100, size: 5 }],
      bids: [],
    };
    const { order, trades } = await engine.submit("sol-usdt", "buy", "limit", 95, 3, TIMENOW, { virtualBook });
    expect(order.status).to.equal("open");
    expect(order.size_remaining).to.be.closeTo(3, 1e-9);
    expect(trades.length).to.equal(0);
  });

  it("submits a limit buy that crosses the spread and fills", async () => {
    const virtualBook = {
      asks: [{ price: 100, size: 10 }],
      bids: [],
    };
    const { order, trades } = await engine.submit("link-usdt", "buy", "limit", 101, 5, TIMENOW, { virtualBook });
    expect(order.status).to.equal("filled");
    expect(trades.length).to.be.at.least(1);
  });

  it("cancels an open order", async () => {
    const virtualBook = { asks: [], bids: [] };
    const { order } = await engine.submit("doge-usdt", "buy", "limit", 0.05, 100, TIMENOW, { virtualBook });
    expect(order.status).to.equal("open");

    await engine.cancel(order.id);
    const orders = await engine.listOrders("doge-usdt", false);
    const cancelled = orders.find((o) => o.id === order.id);
    expect(cancelled).to.exist;
    expect(cancelled.status).to.equal("cancelled");
  });

  it("rejects cancel of a filled order", async () => {
    const virtualBook = {
      asks: [{ price: 50, size: 10 }],
      bids: [],
    };
    const { order } = await engine.submit("avax-usdt", "buy", "market", null, 5, TIMENOW, { virtualBook });
    expect(order.status).to.equal("filled");
    try {
      await engine.cancel(order.id);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).to.be.instanceOf(MatchError);
    }
  });

  it("lists orders filtered by market", async () => {
    const virtualBook = { asks: [], bids: [] };
    await engine.submit("uni-usdt", "buy", "limit", 10, 1, TIMENOW, { virtualBook });
    await engine.submit("uni-usdt", "buy", "limit", 11, 2, TIMENOW, { virtualBook });
    await engine.submit("atom-usdt", "sell", "limit", 12, 3, TIMENOW, { virtualBook });

    const uniOrders = await engine.listOrders("uni-usdt", true);
    expect(uniOrders.length).to.be.at.least(2);
    for (const o of uniOrders) {
      expect(o.market_id).to.equal("uni-usdt");
    }
  });

  it("rejects invalid side", async () => {
    try {
      await engine.submit("btc-usdt", "invalid", "market", null, 1, TIMENOW);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).to.be.instanceOf(MatchError);
      expect(e.code).to.equal("BAD_REQUEST");
    }
  });

  it("rejects invalid order type", async () => {
    try {
      await engine.submit("btc-usdt", "buy", "invalid", null, 1, TIMENOW);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).to.be.instanceOf(MatchError);
    }
  });

  it("rejects limit order without price", async () => {
    try {
      await engine.submit("btc-usdt", "buy", "limit", null, 1, TIMENOW);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).to.be.instanceOf(MatchError);
      expect(e.message).to.include("limit order requires price");
    }
  });

  it("rejects zero or negative size", async () => {
    try {
      await engine.submit("btc-usdt", "buy", "market", null, 0, TIMENOW);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).to.be.instanceOf(MatchError);
    }
  });
});
