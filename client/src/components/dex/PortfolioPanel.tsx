"use client";

import { useMemo } from "react";
import { useMarketsStream } from "../../context/MarketsStreamContext";
import { usePaperTrade, type PaperPosition } from "../../context/PaperTradeContext";

function fmtPrice(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n < 0.000001) return n.toFixed(10);
  if (n < 0.01) return n.toFixed(8);
  if (n < 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPnl(n: number) {
  const abs = Math.abs(n);
  const value = abs >= 1000
    ? abs.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : abs.toFixed(4);
  return `${n >= 0 ? "+" : "-"}$${value}`;
}

function pnlFor(position: PaperPosition, markPrice: number) {
  return position.side === "long"
    ? (markPrice - position.entryPrice) * position.sizeBase
    : (position.entryPrice - markPrice) * position.sizeBase;
}

export function PortfolioPanel() {
  const { positions } = usePaperTrade();
  const { overview } = useMarketsStream();

  const priceByMarket = useMemo(() => {
    const map = new Map<string, number>();
    for (const market of overview?.markets ?? []) {
      map.set(market.id, market.mark_price);
    }
    return map;
  }, [overview]);

  const rows = useMemo(
    () => positions.map((position) => {
      const markPrice = priceByMarket.get(position.marketId);
      const pnl = markPrice == null ? null : pnlFor(position, markPrice);
      return { position, markPrice, pnl };
    }),
    [positions, priceByMarket],
  );

  const totalPnl = rows.reduce((sum, row) => sum + (row.pnl ?? 0), 0);

  return (
    <section
      aria-labelledby="portfolio-heading"
      className="mb-6 overflow-hidden rounded-2xl"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
        <div>
          <h2 id="portfolio-heading" className="m-0 text-sm font-semibold text-white">Portfolio</h2>
          <p className="m-0 mt-1 text-xs text-white/40">Paper positions marked against live prices</p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[10px] uppercase tracking-wider text-white/35">Unrealised PnL</p>
          <p className={`m-0 font-mono text-sm font-semibold ${totalPnl >= 0 ? "text-[#3dffa0]" : "text-[#ef5350]"}`}>
            {fmtPnl(totalPnl)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="bg-white/[0.02]">
              {["Pair", "Side", "Size", "Entry", "Mark", "PnL", "PnL %"].map((heading, idx) => (
                <th
                  key={heading}
                  className={`border-b border-white/[0.06] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white/40 ${idx >= 2 ? "text-right" : "text-left"}`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-5 text-sm text-white/40">
                  No open paper positions.
                </td>
              </tr>
            )}
            {rows.map(({ position, markPrice, pnl }) => {
              const entryValue = position.entryPrice * position.sizeBase;
              const pnlPct = entryValue > 0 && pnl != null ? (pnl / entryValue) * 100 : null;
              return (
                <tr key={position.id} className="border-b border-white/[0.04] last:border-b-0">
                  <td className="px-4 py-3 text-sm font-medium text-white">{position.pair}</td>
                  <td className={`px-4 py-3 text-sm capitalize ${position.side === "long" ? "text-[#3dffa0]" : "text-[#ef5350]"}`}>
                    {position.side}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-white/70">{position.sizeBase.toFixed(4)}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-white/70">{fmtPrice(position.entryPrice)}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-white/70">{markPrice == null ? "—" : fmtPrice(markPrice)}</td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-semibold ${pnl == null || pnl >= 0 ? "text-[#3dffa0]" : "text-[#ef5350]"}`}>
                    {pnl == null ? "—" : fmtPnl(pnl)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-semibold ${pnl == null || pnl >= 0 ? "text-[#3dffa0]" : "text-[#ef5350]"}`}>
                    {pnlPct == null ? "—" : `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
