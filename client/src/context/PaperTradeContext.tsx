"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const LS_KEY = "zync_paper_v1";

export type PaperPosition = {
  id: string;
  marketId: string;
  pair: string;
  side: "long" | "short";
  sizeBase: number;
  entryPrice: number;
  marginQuote: number;
  openedAt: number;
};

export type PaperOrder = {
  id: string;
  marketId: string;
  pair: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  sizeBase: number;
  limitPrice?: number;
  status: "open" | "partially_filled" | "filled" | "cancelled";
  createdAt: number;
};

export type ClosedTrade = {
  positionId: string;
  marketId: string;
  pair: string;
  side: "long" | "short";
  sizeBase: number;
  entryPrice: number;
  exitPrice: number;
  realisedPnl: number;
  closedAt: number;
};

type PersistedState = {
  positions: PaperPosition[];
  orders: PaperOrder[];
  closedTrades: ClosedTrade[];
};

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { positions: [], orders: [], closedTrades: [] };
    const j = JSON.parse(raw) as {
      positions?: PaperPosition[];
      orders?: PaperOrder[];
      closedTrades?: ClosedTrade[];
    };
    return {
      positions: j.positions ?? [],
      orders: j.orders ?? [],
      closedTrades: j.closedTrades ?? [],
    };
  } catch {
    return { positions: [], orders: [], closedTrades: [] };
  }
}

function newClientId(prefix: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;
}

export type PlaceMarketArgs = {
  marketId: string;
  pair: string;
  side: "buy" | "sell";
  sizeBase: number;
  markPrice: number;
  fillPrice?: number;
  positionId?: string;
};

export type PlaceMarketResult =
  | { fillPrice: number; fee: number; isNew: boolean }
  | { error: string };

export type PlaceLimitArgs = {
  id?: string;
  marketId: string;
  pair: string;
  side: "buy" | "sell";
  sizeBase: number;
  limitPrice: number;
  status?: PaperOrder["status"];
};

type Ctx = {
  positions: PaperPosition[];
  openOrders: PaperOrder[];
  closedTrades: ClosedTrade[];
  placeMarket: (args: PlaceMarketArgs) => PlaceMarketResult;
  placeLimit: (args: PlaceLimitArgs) => void;
  cancelOrder: (id: string) => void;
  closePosition: (id: string, markPrice: number) => void;
};

const PaperCtx = createContext<Ctx | null>(null);

export function PaperTradeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(load);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch { /* private/incognito mode — silently skip persistence */ }
  }, [state]);

  const openOrders = useMemo(
    () => state.orders.filter((o) => o.status === "open" || o.status === "partially_filled"),
    [state.orders],
  );

  const placeMarket = useCallback((args: PlaceMarketArgs): PlaceMarketResult => {
    if (!(args.sizeBase > 0) || !Number.isFinite(args.sizeBase)) {
      return { error: "Invalid size" };
    }
    const slip = args.side === "buy" ? 1.00025 : 0.99975;
    const fillPrice = args.fillPrice ?? args.markPrice * slip;
    if (!(fillPrice > 0) || !Number.isFinite(fillPrice)) {
      return { error: "Invalid fill price" };
    }
    const notional = fillPrice * args.sizeBase;
    const fee = notional * 0.0004;
    const posSide: "long" | "short" = args.side === "buy" ? "long" : "short";

    let isNew = false;
    setState((s) => {
      const existing = s.positions.find(
        (p) => p.marketId === args.marketId && p.side === posSide,
      );
      if (existing) {
        const totalSize = existing.sizeBase + args.sizeBase;
        const weightedEntry =
          (existing.entryPrice * existing.sizeBase + fillPrice * args.sizeBase) /
          totalSize;
        return {
          ...s,
          positions: s.positions.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  sizeBase: totalSize,
                  entryPrice: weightedEntry,
                  marginQuote: p.marginQuote + notional * 0.1 + fee,
                }
              : p,
          ),
        };
      }
      isNew = true;
      const id = args.positionId ?? newClientId("p");
      return {
        ...s,
        positions: [
          ...s.positions,
          {
            id,
            marketId: args.marketId,
            pair: args.pair,
            side: posSide,
            sizeBase: args.sizeBase,
            entryPrice: fillPrice,
            marginQuote: notional * 0.1 + fee,
            openedAt: Date.now(),
          },
        ],
      };
    });
    return { fillPrice, fee, isNew };
  }, []);

  const placeLimit = useCallback((args: PlaceLimitArgs) => {
    const id = args.id ?? newClientId("o");
    setState((s) => ({
      ...s,
      orders: [
        ...s.orders,
        {
          id,
          marketId: args.marketId,
          pair: args.pair,
          side: args.side,
          orderType: "limit",
          sizeBase: args.sizeBase,
          limitPrice: args.limitPrice,
          status: args.status ?? "open",
          createdAt: Date.now(),
        },
      ],
    }));
  }, []);

  const cancelOrder = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      orders: s.orders.map((o) =>
        o.id === id ? { ...o, status: "cancelled" as const } : o,
      ),
    }));
  }, []);

  const closePosition = useCallback((id: string, markPrice: number) => {
    setState((s) => {
      const pos = s.positions.find((p) => p.id === id);
      if (!pos) return s;

      const realisedPnl =
        pos.side === "long"
          ? (markPrice - pos.entryPrice) * pos.sizeBase
          : (pos.entryPrice - markPrice) * pos.sizeBase;

      return {
        ...s,
        positions: s.positions.filter((p) => p.id !== id),
        closedTrades: [
          ...s.closedTrades,
          {
            positionId: pos.id,
            marketId: pos.marketId,
            pair: pos.pair,
            side: pos.side,
            sizeBase: pos.sizeBase,
            entryPrice: pos.entryPrice,
            exitPrice: markPrice,
            realisedPnl,
            closedAt: Date.now(),
          },
        ],
      };
    });
  }, []);

  const value = useMemo(
    () => ({
      positions: state.positions,
      openOrders,
      closedTrades: state.closedTrades,
      placeMarket,
      placeLimit,
      cancelOrder,
      closePosition,
    }),
    [state, openOrders, placeMarket, placeLimit, cancelOrder, closePosition],
  );

  return <PaperCtx.Provider value={value}>{children}</PaperCtx.Provider>;
}

export function usePaperTrade() {
  const v = useContext(PaperCtx);
  if (!v) throw new Error("PaperTradeProvider missing");
  return v;
}
