# AI Wealth Dashboard — Project Documentation

> This document is the primary reference for any AI assistant (Kiro, GitHub Copilot, Cursor, etc.) working on this codebase. Read it fully before making changes.

---

## What This Project Is

A **local-first personal investment tracking dashboard** for a retail investor using the XTB broker platform (Romania). Because XTB has no public API, all data enters the system through:

1. A daily **XTB screenshot** (the "Positions deschise" table) → processed by Gemini AI
2. Three **manually entered values** per day (RON deposited, free RON, ETF EUR value)

Everything runs locally — Next.js dev server + SQLite. No cloud, no auth, no external data syncing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript strict |
| Styling | Tailwind CSS (dark mode, `class` strategy) + shadcn/ui |
| Charts | Recharts |
| Database | SQLite via Prisma ORM (`prisma/dev.db`) |
| AI / OCR | Google Gemini API (`gemini-2.5-flash-lite`) |
| Testing | Vitest + React Testing Library + fast-check (PBT) |
| Node | v18+ required |

---

## Architecture

```
Browser (React client components)
  └── Next.js App Router (localhost:3000)
        ├── /app/components/tabs/   ← One component per tab
        ├── /app/api/               ← Route handlers (REST)
        ├── /lib/                   ← Pure business logic
        └── /prisma/                ← Schema + migrations + dev.db
```

### Tab Layout (in order)

| Tab | Component | Purpose |
|---|---|---|
| Live Dashboard | `LiveDashboard.tsx` | Net wealth in RON, allocation donuts, P&L |
| Stocks | `Allocation.tsx` | Position table (sortable), AI tips |
| Performance | `Performance.tsx` | Historical line charts, per-stock history cards |
| News | `News.tsx` | CNBC/MarketWatch RSS filtered to portfolio |
| Forecast | `Forecast.tsx` | Monte Carlo simulation |
| Daily Log | `DailyLog.tsx` | **Main ingestion page** |
| ⚙ Settings | `app/settings/page.tsx` | OCR backend, Gemini token, news feeds |

---

## Database Schema (Prisma / SQLite)

### `DailyEntry` — one row per day of ingestion
```
date               String  @unique   // "YYYY-MM-DD"
totalDepositedRON  Float             // cumulative RON fed into XTB since opening
freeRON            Float             // RON cash not deployed in USD or EUR
etfValueEUR        Float             // total EUR ETF value (deposits + profit)
etfDepositedEUR    Float             // EUR originally deposited into ETF
usdTotalValue      Float             // from screenshot: total USD balance (stocks + cash)
usdFreeFunds       Float             // from screenshot: unused USD cash in XTB
usdNetProfitLoss   Float             // from screenshot: P&L on OPEN positions only
usdRealizedPnl     Float             // manual: cumulative P&L from SOLD/closed positions
```

### `Asset` — current stock positions (updated on each ingestion)
```
ticker        String  @unique
name          String
type          String   // "Stock" | "ETF"
sector        String   // see VALID_SECTORS in lib/assets.ts
currentValue  Float    // Valoare — total current USD value of the position
costBasis     Float    // Pret deschidere — avg buy price per share
currentPrice  Float    // Pret actual — current price per share
currency      String   // "USD" | "EUR" | "RON"
```

### `AssetSnapshot` — daily timeseries per stock (for charts)
```
date          String   // "YYYY-MM-DD"
ticker        String
currentValue  Float
currentPrice  Float
avgBuyPrice   Float
@@unique([date, ticker])
```

### `RateCache` — BNR exchange rates singleton
```
id        String  @id @default("singleton")
ronUsd    Float
ronEur    Float
fetchedAt DateTime
```

### `NewsCache`, `ClosingSnapshot`, `ManualTotals` — legacy / supporting tables

---

## Daily Ingestion Flow

This is the core workflow the user performs every day:

1. User opens the **Daily Log** tab
2. Uploads their XTB screenshot (PNG/JPG, the "Pozitii deschise" screen)
3. Two Gemini API calls run in parallel:
   - `/api/ocr` → extracts `usdTotalValue`, `usdFreeFunds`, `usdNetProfitLoss` from the bottom bar
   - `/api/ocr/positions` → extracts all stock rows (name, valoare, pret actual, pret deschidere) and writes to `Asset` + `AssetSnapshot`
4. User reviews/corrects the 3 USD fields + fills in RON deposited, free RON, ETF EUR
5. User clicks **Save** → writes `DailyEntry` row; if no `AssetSnapshot` for today exists yet, a fallback copies current `Asset` values

---

## Key API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/daily-entry` | GET | All entries ordered by date desc |
| `/api/daily-entry` | POST | Upsert today's entry (+ snapshot fallback) |
| `/api/ocr` | POST | Gemini: extract 3 bottom-bar totals from screenshot |
| `/api/ocr/positions` | POST | Gemini: extract full positions table, update Asset + AssetSnapshot |
| `/api/assets` | GET/POST/PATCH/DELETE | Asset CRUD |
| `/api/asset-snapshots` | GET | All AssetSnapshot rows (for Performance charts) |
| `/api/rates` | GET | BNR exchange rates (24h cache) |
| `/api/news` | GET | Ranked news articles (15min cache) |
| `/api/ai-tips` | GET | Gemini portfolio tips (buy/watch/sell) |
| `/api/manual-totals` | GET/PUT | Legacy singleton (superseded by DailyEntry) |
| `/api/settings` | GET/PUT | `data/config.json` |

---

## Key Business Logic Files

| File | What it does |
|---|---|
| `lib/fx.ts` | `toRON(amount, currency, rates)` — applies 0.5% exchange penalty |
| `lib/assets.ts` | Validation, sector taxonomy, position weights, threshold indicators |
| `lib/ocr/positions.ts` | Gemini prompt + parsing for full position table extraction |
| `lib/ocr/gemini.ts` | Gemini prompt + parsing for bottom-bar totals |
| `lib/news/index.ts` | News pipeline: fetch RSS → filter by portfolio → rank → cache |
| `lib/news/ranker.ts` | Priority keyword boost + recency scoring |
| `lib/forecast.ts` | Monthly compounding formula for scenario simulation |

---

## Configuration (`data/config.json`)

```json
{
  "ocrBackend": "gemini",          // "tesseract" | "gemini"
  "geminiApiToken": "...",          // Required for all AI features
  "watchlist": [],                  // Additional tickers to monitor in news
  "newsFeeds": [                    // RSS feed URLs
    "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
    "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069",
    "https://feeds.content.dowjones.io/public/rss/mw_topstories"
  ],
  "simulationDefaults": {
    "monthlyContribution": 500,
    "annualGrowthRate": 7,
    "horizonYears": 5
  }
}
```

---

## Currency Model

The investor holds three buckets:

| Bucket | Currency | Source |
|---|---|---|
| Stocks | USD | XTB screenshot (`usdTotalValue`) |
| ETF | EUR | Manually entered (`etfValueEUR`) |
| Free cash | RON | Manually entered (`freeRON`) |

**Total Net Wealth (RON)** = `toRON(usdTotal, USD) + toRON(etfEUR, EUR) + freeRON`

**P&L (USD)** = `usdNetProfitLoss` (open positions, from screenshot) + `usdRealizedPnl` (closed positions, manual)

**P&L (EUR)** = `etfValueEUR - etfDepositedEUR`

**P&L (RON)** = `totalNetWealth - totalDepositedRON`

---

## Sector Taxonomy

Stocks can be assigned to these sectors (defined in `lib/assets.ts`):

`Technology`, `Semiconductor`, `Software`, `AI & Robotics`, `Healthcare`, `Biotech`, `Finance`, `Energy`, `Consumer`, `Industrial`, `Aerospace & Defense`, `Real Estate`, `Other`

---

## Gemini Model

All AI calls use `gemini-2.5-flash-lite`. If you need to change the model, grep for `gemini-2.5-flash-lite` across `lib/ocr/gemini.ts`, `lib/ocr/positions.ts`, `lib/news/gemini.ts`, and `app/api/ai-tips/route.ts`.

---

## Running Locally

```bash
# First time setup
npm install
npx prisma migrate dev

# Start dev server
npm run dev
# App runs at http://localhost:3000

# Run tests
npx vitest run

# Explore database
npx prisma studio
```

---

## File Structure Summary

```
├── app/
│   ├── api/                    # Route handlers
│   │   ├── daily-entry/        # Core ingestion entry point
│   │   ├── ocr/                # Bottom-bar extraction (Gemini)
│   │   │   └── positions/      # Full positions table extraction (Gemini)
│   │   ├── assets/             # Asset CRUD + PATCH
│   │   ├── asset-snapshots/    # Historical stock timeseries
│   │   ├── rates/              # BNR exchange rates
│   │   ├── news/               # Ranked news
│   │   ├── ai-tips/            # Portfolio AI tips
│   │   ├── manual-totals/      # Legacy
│   │   └── settings/           # config.json CRUD
│   ├── components/tabs/        # One component per tab
│   ├── context/                # RefreshContext (cross-tab refresh signal)
│   ├── layout.tsx              # Root layout with tab shell
│   └── settings/page.tsx       # Settings page
├── lib/
│   ├── fx.ts                   # Currency conversion
│   ├── assets.ts               # Portfolio helpers + validation
│   ├── delta.ts                # Day-over-day delta calculation
│   ├── forecast.ts             # Compounding simulation
│   ├── csv.ts                  # Import/export
│   ├── bnr.ts                  # BNR rate fetching + caching
│   ├── ocr/                    # Tesseract + Gemini OCR backends
│   └── news/                   # News aggregator pipeline
├── prisma/
│   ├── schema.prisma           # Database schema
│   ├── migrations/             # Migration history
│   └── dev.db                  # SQLite database file (gitignored)
├── data/
│   └── config.json             # App config (gitignored)
└── .kiro/
    ├── PROJECT.md              # This file
    └── specs/ai-wealth-dashboard/
        ├── requirements.md     # Original requirements spec
        ├── design.md           # Architecture design doc
        └── tasks.md            # Implementation task list
```

---

## Known Constraints & Design Decisions

1. **No public API from XTB** — everything comes from screenshots. The OCR uses Gemini multimodal because Tesseract fails on the dark UI theme.

2. **Single user, local only** — no auth, no multi-tenancy. Runs on `localhost:3000`.

3. **`usdNetProfitLoss` vs `usdRealizedPnl`** — The screenshot only shows P&L on currently open positions. Profits from sold stocks are invisible in the screenshot and must be tracked manually via `usdRealizedPnl` (carries forward from day to day).

4. **AssetSnapshot fallback** — When saving a DailyEntry, if no AssetSnapshot exists for that date yet (e.g. positions extraction failed or Gemini was down), the save endpoint automatically copies the current Asset table values as a fallback.

5. **`tickerOrder` in localStorage** — The drag-to-reorder order of stock history cards on the Performance tab is stored in the browser's localStorage under the key `"stockHistoryOrder"`.

6. **Gemini rate limits** — The free tier of `gemini-2.5-flash-lite` is used. If you hit 429 errors, wait a minute or upgrade to a paid tier.
