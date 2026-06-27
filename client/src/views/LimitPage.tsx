"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SwapShell, TabNav, Card, Label, BigInput, FlipBtn, ConnectBtn, ActionBtn, TokenDropdown, Pill,
  TOKENS, type Token,
} from "../components/SwapPanel";
import { useWallet } from "../wallet/WalletContext";
import { useMarketsStream } from "../context/MarketsStreamContext";

export function LimitPage() {
  const { address, requestConnect } = useWallet();
  const { overview } = useMarketsStream();

  const [sellToken, setSellToken] = useState<Token>(TOKENS[0]);
  const [buyToken, setBuyToken]   = useState<Token | null>(null);
  const [limitPrice, setLimitPrice] = useState("");
  const [sellAmt, setSellAmt]     = useState("");
  const [offset, setOffset]       = useState<"market" | "+1%" | "+5%" | "+10%">("market");
  const [submitting, setSubmitting] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const byPair = useMemo(() => {
    if (!overview) return new Map<string, { id: string; base: string; quote: string; price: number }>();
    const m = new Map<string, { id: string; base: string; quote: string; price: number }>();
    for (const mk of overview.markets) {
      m.set(`${mk.base}/${mk.quote}`, { id: mk.id, base: mk.base, quote: mk.quote, price: mk.mark_price });
      m.set(`${mk.quote}/${mk.base}`, { id: mk.id, base: mk.base, quote: mk.quote, price: mk.mark_price });
    }
    return m;
  }, [overview]);

  const resolved = useMemo<{
    marketId: string; side: "buy" | "sell"; base: string; quote: string; markPrice: number;
  } | null>(() => {
    if (!buyToken || !overview) return null;
    const e = byPair.get(`${sellToken.symbol}/${buyToken.symbol}`);
    if (!e) return null;
    return {
      marketId: e.id, base: e.base, quote: e.quote, markPrice: e.price,
      side: sellToken.symbol === e.quote ? "buy" : "sell",
    };
  }, [sellToken, buyToken, overview, byPair]);

  useEffect(() => {
    if (resolved && offset === "market") setLimitPrice(String(resolved.markPrice));
  }, [resolved]);

  const handleOffset = useCallback((v: typeof offset) => {
    setOffset(v);
    if (!resolved) return;
    if (v === "market") { setLimitPrice(String(resolved.markPrice)); return; }
    const pct = Number.parseFloat(v.replace("%", "")) / 100;
    setLimitPrice((resolved.markPrice * (1 + pct)).toFixed(Math.min(resolved.markPrice < 1 ? 6 : 4, 6)));
  }, [resolved]);

  const parsedPrice = useMemo(() => {
    const n = Number.parseFloat(limitPrice);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [limitPrice]);

  const parsedAmt = useMemo(() => {
    const n = Number.parseFloat(sellAmt);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [sellAmt]);

  const estimatedReceive = useMemo(() => {
    if (!resolved || parsedPrice <= 0 || parsedAmt <= 0) return 0;
    if (resolved.side === "buy") return parsedAmt / parsedPrice;
    return parsedAmt;
  }, [resolved, parsedPrice, parsedAmt]);

  const canSubmit = Boolean(address && resolved && parsedPrice > 0 && parsedAmt > 0 && !submitting);

  async function onSubmit() {
    if (!resolved || parsedPrice <= 0 || parsedAmt <= 0) return;
    setSubmitting(true);
    setTxResult(null);
    setTxError(null);

    const size = resolved.side === "buy" ? parsedAmt / parsedPrice : parsedAmt;

    try {
      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market_id: resolved.marketId,
          side: resolved.side,
          order_type: "limit",
          size,
          price: parsedPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setTxError(data?.error?.message ?? `HTTP ${res.status}`); return; }
      const fills = (data.trades ?? []).length;
      setTxResult(
        fills > 0 ? `Limit order placed — ${fills} fill${fills > 1 ? "s" : ""}`
          : "Limit order placed — open on the order book",
      );
      setSellAmt("");
    } catch (e) { setTxError(e instanceof Error ? e.message : "Network error"); }
    finally { setSubmitting(false); }
  }

  function flip() {
    if (!buyToken) return;
    const prev = sellToken;
    setSellToken(buyToken);
    setBuyToken(prev);
  }

  return (
    <SwapShell>
      <TabNav />

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <Label>Limit price</Label>
          <button type="button" className="text-white/40 hover:text-white/80 transition-colors">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
            </svg>
          </button>
        </div>
        <BigInput value={limitPrice} onChange={setLimitPrice} />
        <div className="mt-3 flex gap-2">
          {(["market", "+1%", "+5%", "+10%"] as const).map(v => (
            <Pill key={v} label={v === "market" ? "Market" : v} active={offset === v} onClick={() => handleOffset(v)} />
          ))}
        </div>
        {resolved && (
          <p className="mt-2 text-xs text-white/40">Mark: {resolved.markPrice.toLocaleString()} {resolved.quote}</p>
        )}
      </Card>

      <Card className="mt-2">
        <Label>Sell</Label>
        <div className="flex items-center justify-between gap-3">
          <BigInput value={sellAmt} onChange={setSellAmt} />
          <TokenDropdown value={sellToken} onChange={setSellToken} exclude={buyToken?.symbol} />
        </div>
      </Card>

      <FlipBtn onClick={flip} />

      <Card>
        <Label>Buy</Label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[2.6rem] font-light text-white/20 leading-none">
            {estimatedReceive > 0 ? estimatedReceive.toFixed(6) : "0"}
          </span>
          <TokenDropdown value={buyToken} onChange={setBuyToken} exclude={sellToken.symbol} placeholder="Select token" />
        </div>
        {resolved && parsedPrice > 0 && (
          <p className="mt-1 text-xs text-white/40">
            1 {resolved.base} = {parsedPrice.toFixed(Math.min(resolved.markPrice < 1 ? 6 : 4, 6))} {resolved.quote}
          </p>
        )}
      </Card>

      {!address
        ? <ConnectBtn onClick={requestConnect} />
        : !resolved
          ? <ActionBtn disabled>Select supported tokens</ActionBtn>
          : <ActionBtn onClick={onSubmit} disabled={!canSubmit}>
              {submitting ? "Placing…" : "Place limit order"}
            </ActionBtn>
      }

      {txResult && <p className="mt-3 text-xs text-[rgba(110,231,194,0.9)]">{txResult}</p>}
      {txError && <p className="mt-3 break-words font-mono text-xs text-red-300">{txError}</p>}

      <div className="mt-3 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs text-white/55"
        style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
        </svg>
        <span>
          Orders are matched against the simulated order book.{" "}
          <span className="cursor-pointer hover:underline transition-colors" style={{ color: "#3dffa0" }}>Learn more</span>
        </span>
      </div>
    </SwapShell>
  );
}
