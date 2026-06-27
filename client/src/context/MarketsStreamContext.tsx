"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MarketsOverview, WsMessage } from "../types/markets";

type Ctx = {
  overview: MarketsOverview | null;
  connected: boolean;
};

const StreamCtx = createContext<Ctx>({ overview: null, connected: false });

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const JITTER_FACTOR = 0.3;

function wsUrlFromLocation(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/markets`;
}

export function MarketsStreamProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<MarketsOverview | null>(null);
  const [connected, setConnected] = useState(false);
  const alive = useRef(true);
  const retryCount = useRef(0);

  useEffect(() => {
    alive.current = true;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function scheduleReconnect() {
      const attempt = retryCount.current;
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** attempt,
        RECONNECT_MAX_MS,
      );
      const jitter = delay * JITTER_FACTOR * (Math.random() * 2 - 1);
      const totalDelay = Math.round(Math.max(100, delay + jitter));
      retryTimer = setTimeout(connect, totalDelay);
      retryCount.current = attempt + 1;
    }

    function connect() {
      try {
        ws = new WebSocket(wsUrlFromLocation());
      } catch (e) {
        console.warn("MarketsStream WS create:", e);
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (alive.current) {
          setConnected(true);
          retryCount.current = 0;
        }
      };

      ws.onclose = () => {
        if (alive.current) {
          setConnected(false);
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as WsMessage;
          if (msg.type === "snapshot" || msg.type === "tick") {
            setOverview(msg.overview);
          }
        } catch {
          console.warn("MarketsStream malformed message");
        }
      };
    }

    connect();
    return () => {
      alive.current = false;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  const value = useMemo(() => ({ overview, connected }), [overview, connected]);
  return <StreamCtx.Provider value={value}>{children}</StreamCtx.Provider>;
}

export function useMarketsStream() {
  return useContext(StreamCtx);
}
