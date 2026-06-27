/**
 * Accessors for the engine singletons.
 *
 * In normal operation server.js creates the engines on globalThis before
 * app.prepare(). This module lazily creates them on first access so that
 * API routes also work when imported during `next build` or in standalone
 * serverless contexts.
 *
 * The lazy-init uses a non-broadcasting market engine (broadcastInterval 0
 * disables the timer) and an in-memory matching engine (no file I/O).
 */

import { MarketEngine } from "./marketEngine.js";
import { createMatchingEngine } from "./matchingEngine.js";

function ensureEngines() {
  if (!globalThis._marketEngine) {
    globalThis._marketEngine = new MarketEngine(0);
  }
  if (!globalThis._matchingEngine) {
    globalThis._matchingEngine = createMatchingEngine(null);
  }
}

export function getMarketEngine() {
  ensureEngines();
  return globalThis._marketEngine;
}

export function getMatchingEngine() {
  ensureEngines();
  return globalThis._matchingEngine;
}
