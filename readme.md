# ZyncSwap — Smart Contract Assessment
ZyncSwap is a full-stack decentralised exchange (DEX) platform with simulated perpetual futures trading, an on-chain ERC-20 token (ZYNC), real wallet connectivity, and a WebSocket-driven market data feed.

## Getting Started
You need **Node.js 18+** and **npm**.
```bash
npm install
cp .env.example .env
npm run chain
npm run deploy
# Update .env with ZYNC_TOKEN_ADDRESS
npm run dev
```

## Implemented Tasks & How I Solved Them

### Task 1 — Bug Fix (Order Submission)
**Issue:** The `TradeEntryPanel` POST request to `/api/v1/orders` was failing. The server was also crashing on startup, and API key authentication was broken.
**How I solved it:** 
- Identified that `server.js` was missing an import for `parse` from `node:url` and added it to prevent startup crashes.
- Identified that `requireApiKey` was called but not imported in `app/api/v1/orders/route.js` and `app/api/v1/orders/[id]/route.js`. I added the missing imports to fix the API authentication.
- Fixed the API route to accept order payloads defensively, mapping camelCase to snake_case. 
- Integrated frontend `TradeEntryPanel` with `PaperTradeContext` so limit and market orders accurately update the order book.

### Task 2 — Candle API Endpoint
**Issue:** Provide an endpoint to fetch OHLCV candle data.
**How I solved it:** 
- Created a new route `GET /api/v1/markets/:id/candles`.
- Separated business logic into `lib/candles.js` to parse timeframe queries (`1m`, `5m`, `15m`, `1h`) and limits (default 100, max 500).
- Handled errors effectively by throwing a custom `CandleValidationError` to return a 400 response.
- Plumbed data through `marketEngine` to aggregate 1m candles into the requested timeframe on the fly.

### Task 3 — Frontend Feature (Portfolio Panel)
**Issue:** Display open paper-trade positions on the `/markets` page with live PnL.
**How I solved it:**
- Created a `PortfolioPanel` component using `useMarketsStream()` to get live WebSocket prices.
- Iterated over open positions from `usePaperTrade()` and calculated real-time Unrealised PnL based on live `markPrice`.
- Showed total Unrealised PnL and applied responsive Tailwind styling with color-coded positive/negative highlights.
- Embedded the component into `MarketsPage.tsx`.

### Task 4 — Smart Contract Extension
**Issue:** Implement token burning functionality.
**How I solved it:**
- Added a `burn(uint256 amount)` method to `ZyncToken.sol` extending `ERC20`.
- Added a `burnFrom(address account, uint256 amount)` method, utilising OpenZeppelin's `_spendAllowance`.
- Added a `totalBurned` public state variable to track the lifetime burned amount.
- Emitted a standard `Burned` event.
- Added comprehensive edge-case tests in Hardhat, covering 0-amount burns, exceeding balance, and allowance logic. Added gas optimization and security edge-case testing.

## Testing

```bash
# Backend/Engine Tests
npm run test:backend

# Smart Contract Tests (Includes gas optimization and security audit edge cases)
npm run test:contracts
```

## What I Would Improve Given More Time
- **Persistent storage** — SQLite/PostgreSQL instead of localStorage + JSON file
- **Wallet-level authentication** — sign a challenge with the connected wallet
- **Rate limiting** — per-IP or per-wallet rate limits on order submission
- **Fuzz testing** — invariant-based fuzz tests for matching engine
- **E2E tests** — Playwright for critical flows


## Architecture Overview

```mermaid
flowchart TB
    subgraph Client["Next.js Client (port 3000)"]
        UI["React UI Pages
            ───────────────
            • / — Home
            • /swap — Multi-token swap
            • /trade/:id — Perp trading
            • /markets — Market overview
            • /buy — Buy ZYNC
            • /sell — Burn ZYNC
            • /limit — Limit order form
            • /docs — Documentation"]
        WC["WalletConnectModal
            ───────────────
            • EIP-6963 injected wallets
            • WalletConnect QR (WC v2)
            • MetaMask / Coinbase / Phantom / etc."]
        CTX["React Contexts
            ───────────────
            • WalletContext (viem)
            • MarketsStreamContext (WS)
            • PaperTradeContext (localStorage)
            • ConfigContext
            • FavoritesContext"]
    end

    subgraph Server["Custom Next.js Server (server.js)"]
        API["API Routes (app/api/v1/)
            ───────────────────────
            GET  /config
            GET  /markets
            GET  /markets/:id
            GET  /markets/:id/candles
            POST /orders
            GET  /orders
            DELETE /orders/:id
            GET  /swap/quote
            GET  /wallets/:addr/zync-balance"]
        WS["WebSocket Server (/ws/markets)
            ───────────────────────────────
            • Snapshot on connect
            • Real-time ticks every 2s"]
        ME["MarketEngine
            ─────────────
            • 35 synthetic markets
            • Binance WS feed fallback
            • OHLCV candle aggregation
            • Order book simulation"]
        MatE["MatchingEngine
            ───────────────
            • Limit order book
            • Market order fills
            • Virtual liquidity layer
            • JSON persistence"]
        SQ["SwapQuote Engine
            ────────────────
            • Uniswap V2 quote math
            • Calldata encoding
            • Price impact calc"]
    end

    subgraph Blockchain["EVM Blockchain (Hardhat / Sepolia / Mainnet)"]
        ZT["ZyncToken (ERC-20)
            ──────────────────
            • mintWithEth() — public sale
            • burn() — token burn
            • burnFrom() — delegated burn
            • totalBurned counter
            • MAX_SUPPLY cap"]
    end

    subgraph External["External"]
        BW["Binance WS
            (miniTicker stream)"]
        WCCloud["WalletConnect Cloud
            (QR code relay)"]
    end

    %% Data flow
    UI --> CTX
    CTX --> WC
    WC --> WCCloud
    CTX -->|"eth_requestAccounts / EIP-6963"| Blockchain
    UI -->|"HTTP fetch"| API
    API --> ME
    API --> MatE
    API --> SQ
    UI -->|"WebSocket"| WS
    WS --> ME
    ME --> BW
    SQ --> ZT
    UI -->|"viem writeContract"| ZT
```

---

## Data Flow Diagrams

### Swap Flow (Buy ZYNC with ETH)

```mermaid
sequenceDiagram
    actor U as User
    participant UI as SwapPage
    participant WC as WalletContext
    participant API as /api/v1/config
    participant RPC as EVM RPC
    participant SC as ZyncToken

    UI->>API: GET /api/v1/config
    API-->>UI: { chain_id, rpc_url, zync_token_address, wallet_connect_project_id }
    UI->>WC: connect wallet (injected / WalletConnect)
    WC-->>UI: { address, publicClient, walletClient }

    UI->>RPC: publicClient.readContract(mintPriceWei)
    UI->>RPC: publicClient.readContract(symbol, decimals)
    UI->>RPC: publicClient.getBalance(address)
    RPC-->>UI: { price, symbol, balance }

    U->>UI: enters 0.1 ETH
    UI->>UI: estimatedReceive = (0.1 * 10^18) / mintPriceWei
    UI->>API: GET /api/v1/swap/quote?amount_in=...&from=native&to=token
    API-->>UI: { amount_out, amount_out_min, path }

    U->>UI: clicks "Buy ZYNC"
    UI->>WC: walletClient.writeContract(mintWithEth, value=0.1eth)
    WC->>SC: sends tx (mintWithEth{value: 0.1 ETH})
    SC-->>WC: tx hash
    WC-->>UI: tx hash
    UI->>RPC: waitForTransactionReceipt(hash)
    RPC-->>UI: receipt
    UI->>UI: refreshReads() — update balances
```

### Trade Flow (Paper Perpetual)

```mermaid
sequenceDiagram
    actor U as User
    participant UI as TradePage
    participant ME as MarketEngine
    participant MatE as MatchingEngine
    participant WS as WebSocket

    UI->>WS: connect /ws/markets
    WS-->>UI: { type: "snapshot", overview }
    loop every 2s
        ME-->>WS: { type: "tick", overview }
        WS-->>UI: update prices, positions PnL
    end

    U->>UI: submits market buy 0.1 BTC
    UI->>MatE: POST /api/v1/orders { side: "buy", type: "market", size: 0.1 }
    MatE->>MatE: match against virtual liquidity
    MatE-->>UI: { id, fills: [...], position aggregated }

    UI->>UI: PaperTradeContext stores new position
    UI->>UI: Position table shows live PnL = (mark - entry) * size
```

### Market Data Pipeline

```mermaid
flowchart LR
    BW[Binance WS] -->|"miniTicker 35 pairs"| ME[MarketEngine]
    ME -->|"price, volume, OI"| CB[1m Candle Buckets]
    CB -->|"aggregate 5m/15m/1h"| AC[Aggregated Candles]
    ME -->|"every 2s"| BC[Broadcast tick]
    BC -->|"JSON snapshot"| CLI[All WS Clients]
    CLI -->|"overview"| CTX[MarketsStreamContext]
    CTX -->|"live price"| TR[TradePage / MarketPage]
```

---