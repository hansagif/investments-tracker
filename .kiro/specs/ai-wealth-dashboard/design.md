# Design Document

## Overview

The AI Wealth Dashboard is a **local-first** single-user web application built with Next.js (App Router). It runs entirely on the investor's machine — no cloud database, no external authentication, no hosted backend. All persistent data lives in a local SQLite file managed by Prisma ORM.

The application provides six core capabilities that map directly to the six UI tabs:

| Tab | Capability | Key subsystem |
|---|---|---|
| Live Dashboard | Net wealth in RON + FX ticker | BNR_Service · FX_Converter |
| Daily Log | OCR screenshot ingestion | OCR_Engine |
| Performance | Day-over-day delta | Delta_Tracker |
| Allocation | Donut charts + warnings | Portfolio_Manager |
| News | AI-filtered articles | News_Aggregator |
| Forecast | Compounding simulation | Forecasting_Engine |

Because XTB exposes no API, every day's portfolio snapshot enters the system through an image upload rather than a live feed. The application is therefore centered around the **Closing_Snapshot** record as the authoritative source of truth for all wealth calculations.

---

## Architecture

### High-Level Architecture

```
Browser (React)
  └── Next.js App Router (local dev server, port 3000)
        ├── /app  — page & layout components
        ├── /app/api  — Next.js Route Handlers (REST-like JSON endpoints)
        │     ├── /api/rates          ← BNR_Service
        │     ├── /api/snapshots      ← Portfolio_Manager (CRUD)
        │     ├── /api/ocr            ← OCR_Engine
        │     ├── /api/assets         ← Portfolio_Manager (assets)
        │     ├── /api/news           ← News_Aggregator
        │     └── /api/settings       ← Settings (config.json)
        ├── /lib  — shared business logic (pure TS)
        │     ├── fx.ts               ← FX_Converter
        │     ├── delta.ts            ← Delta_Tracker
        │     ├── forecast.ts         ← Forecasting_Engine
        │     ├── ocr/                ← OCR_Engine backends
        │     │     ├── tesseract.ts
        │     │     └── gemini.ts
        │     ├── news/               ← News_Aggregator
        │     │     ├── fetcher.ts
        │     │     ├── ranker.ts
        │     │     └── gemini.ts
        │     └── bnr.ts              ← BNR_Service
        └── /prisma
              ├── schema.prisma
              └── dev.db              ← SQLite file (local data directory)
```

### Data Flow — Daily Workflow

```
User uploads PNG  →  /api/ocr  →  OCR_Engine (Tesseract / Gemini)
                                    │
                             parsed fields shown in review form
                                    │
                          user edits & confirms
                                    │
              /api/snapshots POST  →  Portfolio_Manager  →  SQLite
                                    │
                       Delta_Tracker reads last-2 snapshots
                                    │
                       FX_Converter converts to RON (BNR rates)
                                    │
                       Dashboard re-renders with new figures
```

### Deployment Model

- **Runtime**: Node.js 18+ on the investor's local machine.
- **Start command**: `next dev` (development) or `next build && next start` (production mode).
- **Database**: Single `prisma/dev.db` SQLite file — no server process needed.
- **Configuration**: A `data/config.json` file stores the Watchlist, API tokens, and simulation defaults. This file is outside `prisma/` so it can be backed up independently.
- **No cloud dependency**: BNR exchange rates and news RSS feeds are fetched over the internet; everything else is local. The application degrades gracefully when offline (cached rates, cached news).

---

## Components and Interfaces

### 1. BNR_Service (`/lib/bnr.ts`)

Responsible for fetching and caching official RON exchange rates from the National Bank of Romania.

```typescript
interface ExchangeRates {
  RON_USD: number;   // 1 USD → RON
  RON_EUR: number;   // 1 EUR → RON
  fetchedAt: Date;
}

interface BNRResult {
  rates: ExchangeRates;
  fromCache: boolean;
  cacheAgeMinutes?: number;
}

// Returns current rates or throws BNRError
async function fetchRates(): Promise<BNRResult>

// Reads cached rates from SQLite (RateCache table)
async function getCachedRates(): Promise<ExchangeRates | null>
```

**BNR XML feed URL**: `https://www.bnr.ro/nbrfxrates.xml`  
**Cache strategy**: Rates are stored in the `RateCache` table. On every request the cache row is checked first; a network fetch is attempted only if the row is missing or older than 24 hours (wall-clock time at the server side, not client). If the fetch fails and the cache is < 24 h old, the cache is returned with a `fromCache: true` flag. If the fetch fails and no valid cache exists, a `BNRError` is thrown and surfaced as a dashboard error.

---

### 2. FX_Converter (`/lib/fx.ts`)

Pure functions — no I/O, no side-effects. Converts amounts between currencies using provided rates.

```typescript
const EXCHANGE_PENALTY = 0.005; // 0.5 %

// Convert amount in sourceCurrency to RON
function toRON(
  amount: number,
  sourceCurrency: 'USD' | 'EUR' | 'RON',
  rates: ExchangeRates
): number

// Convert an array of assets to a single RON total
function portfolioTotalRON(
  assets: Asset[],
  rates: ExchangeRates
): number
```

**Penalty application**: Applied once per conversion as a multiplicative reduction.  
`result = amount * rate * (1 - EXCHANGE_PENALTY)` for non-RON currencies.  
RON amounts pass through unchanged (penalty is 0 for same-currency).

---

### 3. OCR_Engine (`/lib/ocr/`)

Pluggable OCR backend. The active backend is read from `config.json`.

```typescript
type OCRBackend = 'tesseract' | 'gemini';

interface ParsedSnapshot {
  totalTransactionValue: number | null;
  freeFunds:             number | null;
  netProfitLoss:         number | null;
  errors:                string[];   // field names that failed
}

interface OCREngine {
  parse(imageBuffer: Buffer, mimeType: string): Promise<ParsedSnapshot>
}
```

**Tesseract backend** (`/lib/ocr/tesseract.ts`): Uses `tesseract.js` (WASM, runs in Node.js process). Pre-processes the image with `sharp` (greyscale, contrast boost) before feeding to Tesseract. Extracts fields using regex patterns calibrated to XTB's UI layout.

**Gemini backend** (`/lib/ocr/gemini.ts`): Uses the `@google/generative-ai` SDK. Sends the raw image as a base64 multimodal part together with a structured prompt asking for the three numeric fields as JSON. Gemini's JSON mode ensures parseable output.

**Validation**: After parsing, both backends apply a numeric range check (`-1,000,000 ≤ value ≤ +1,000,000`). Out-of-range fields are reported in `errors`.

---

### 4. Portfolio_Manager (`/api/snapshots`, `/api/assets`)

Wraps all SQLite operations via Prisma.

```typescript
// Snapshot CRUD
async function addSnapshot(data: SnapshotInput): Promise<Snapshot>
async function getSnapshots(limit?: number): Promise<Snapshot[]>
async function getLatestTwo(): Promise<[Snapshot, Snapshot] | [Snapshot] | []>
async function deleteSnapshot(id: string): Promise<void>

// Asset CRUD
async function upsertAsset(data: AssetInput): Promise<Asset>
async function getAssets(): Promise<Asset[]>
async function deleteAsset(ticker: string): Promise<void>

// CSV Import/Export
async function exportSnapshotsCSV(): Promise<string>   // returns CSV string
async function importSnapshotsCSV(csv: string): Promise<ImportResult>

interface ImportResult {
  imported: number;
  skipped:  number;
  errors:   { row: number; reason: string }[];
}
```

---

### 5. Delta_Tracker (`/lib/delta.ts`)

Pure computation — accepts two snapshots and returns delta values.

```typescript
interface SnapshotDelta {
  totalTransactionValue: DeltaValue;
  freeFunds:             DeltaValue;
  netProfitLoss:         DeltaValue;
  attribution:           Attribution | null;
  winners:               AssetDelta[];  // top 5 positive
  losers:                AssetDelta[];  // top 5 negative
}

interface DeltaValue {
  absolute:   number;
  percentage: number;   // NaN when previous === 0
}

interface Attribution {
  priceAppreciation: DeltaValue;
  currencyMovement:  DeltaValue;
  newDeposits:       DeltaValue;
}
```

**Attribution calculation**: Estimated by comparing currency-adjusted snapshot values. Price appreciation = change in asset valuations; currency movement = change due to FX rate shift between the two snapshot dates; new deposits = difference in Free Funds that isn't explained by P&L movement.

---

### 6. News_Aggregator (`/lib/news/`)

```typescript
interface NewsArticle {
  id:           string;    // hash of URL
  headline:     string;
  source:       string;
  publishedAt:  Date;
  url:          string;
  relevanceTags: string[]; // matched tickers / priority keywords
  score:         number;   // 0–100
}

// Fetches, ranks, and caches articles
async function getNews(
  assets: Asset[],
  watchlist: string[],
  geminiToken?: string
): Promise<NewsArticle[]>  // max 30
```

**RSS/API sources**: Configured in `config.json`. Default: Yahoo Finance RSS feeds.  
**Ranking pipeline**:
  1. Fetch articles from all configured sources (parallel).
  2. Filter: retain only articles mentioning at least one asset ticker or watchlist symbol (case-insensitive substring match in headline + description).
  3. Apply priority keyword boost (+20 points each) for the five hard-coded keywords.
  4. If Gemini token configured: batch articles to Gemini for a 0–100 relevance score; use as primary sort key.
  5. Fallback: sort by `(priorityBoost + recencyScore)` where recencyScore decays over 24 h.
  6. Return top 30.
**Cache**: Stored in the `NewsCache` table; TTL = 15 minutes.

---

### 7. Forecasting_Engine (`/lib/forecast.ts`)

Pure mathematical functions.

```typescript
interface ScenarioInput {
  id:                 string;
  label:              string;   // e.g. "Optimistic"
  monthlyContribution: number;  // RON > 0
  annualGrowthRate:    number;  // 0 < x ≤ 100 (percent)
  horizonYears:        number;  // 1–30
}

interface YearMark {
  year:               number;
  projectedValue:     number;
  totalContributions: number;
  estimatedGain:      number;
}

interface ScenarioResult {
  id:        string;
  yearMarks: YearMark[];
}

function calculateScenario(
  principal:  number,
  scenario:   ScenarioInput
): ScenarioResult
```

**Monthly compounding formula**:

```
monthlyRate = annualGrowthRate / 100 / 12

FV(n) = principal × (1 + monthlyRate)^n
      + monthlyContribution × [(1 + monthlyRate)^n - 1] / monthlyRate
```

Where `n` is the number of months elapsed. Year marks are recorded at `n = 12, 24, 36 … horizonYears × 12`.

---

### 8. Settings Store (`/api/settings`)

Reads/writes `data/config.json`.

```typescript
interface AppConfig {
  ocrBackend:          'tesseract' | 'gemini';
  geminiApiToken:      string;
  watchlist:           string[];          // ticker symbols
  newsFeeds:           string[];          // RSS/API URLs
  simulationDefaults:  Partial<ScenarioInput>;
}
```

---

## Data Models

### SQLite Schema (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model ClosingSnapshot {
  id                    String   @id @default(cuid())
  date                  String   @unique    // ISO 8601 date "YYYY-MM-DD" (user local)
  totalTransactionValue Float
  freeFunds             Float
  netProfitLoss         Float
  currency              String   @default("USD")   // "USD" | "EUR" | "RON"
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

model Asset {
  id           String   @id @default(cuid())
  ticker       String   @unique
  name         String   @default("")
  type         String   // "Stock" | "ETF"
  sector       String   // one of 8 taxonomy values
  currentValue Float
  costBasis    Float
  currency     String   // "USD" | "EUR" | "RON"
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model RateCache {
  id         String   @id @default("singleton")
  ronUsd     Float
  ronEur     Float
  fetchedAt  DateTime
}

model NewsCache {
  id          String   @id    // hash of article URL
  headline    String
  source      String
  publishedAt DateTime
  url         String
  tags        String          // JSON-encoded string[]
  score       Float
  cachedAt    DateTime @default(now())
}
```

### Configuration File (`data/config.json`)

```json
{
  "ocrBackend": "tesseract",
  "geminiApiToken": "",
  "watchlist": [],
  "newsFeeds": ["https://feeds.finance.yahoo.com/rss/2.0/headline"],
  "simulationDefaults": {
    "monthlyContribution": 500,
    "annualGrowthRate": 7,
    "horizonYears": 5
  }
}
```

### CSV Export Format

```
Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency
2024-01-15,9823.45,241.60,-12.30,USD
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: FX penalty applied to cross-currency conversions

*For any* amount in USD or EUR and any valid RON exchange rate, `toRON(amount, currency, rates)` SHALL return a value equal to `amount × rate × (1 - 0.005)` — i.e., exactly 0.5% less than the raw converted amount.

**Validates: Requirements 1.4**

---

### Property 2: FX RON pass-through (no penalty on same-currency)

*For any* numeric amount denominated in RON, `toRON(amount, 'RON', rates)` SHALL return the original amount unchanged without any penalty reduction.

**Validates: Requirements 1.4**

---

### Property 3: BNR cache staleness branch

*For any* cache age value, the BNR rate resolution SHALL return the cached rates when cache age is strictly less than 24 hours, and SHALL throw a `BNRError` when cache age is exactly 24 hours or greater (assuming the live fetch has failed).

**Validates: Requirements 1.3**

---

### Property 4: Delta arithmetic correctness

*For any* pair of Closing_Snapshot values `(a, b)`, the computed `absoluteDelta` SHALL equal `b − a` exactly, and `percentageDelta` SHALL equal `(b − a) / a × 100` (with `NaN`/`Infinity` only when `a = 0`).

**Validates: Requirements 3.1**

---

### Property 5: Delta color sign consistency

*For any* computed delta value, the UI color indicator applied SHALL be the green class when the value is strictly positive, the red class when strictly negative, and no color class when exactly zero.

**Validates: Requirements 3.3**

---

### Property 6: Winners and losers top-5 ordering

*For any* list of asset delta values (of arbitrary length), the winners list SHALL contain the 5 assets with the largest positive absolute change in descending order, and the losers list SHALL contain the 5 assets with the largest negative absolute change in ascending order. When fewer than 5 matching assets exist, all available assets in that direction SHALL be returned.

**Validates: Requirements 3.5**

---

### Property 7: OCR range validation flags out-of-bound fields

*For any* set of three parsed numeric field values, each field whose absolute value exceeds 1,000,000 SHALL appear in the `errors` array of the returned `ParsedSnapshot`, and fields within the valid range SHALL not appear in `errors`.

**Validates: Requirements 2.8**

---

### Property 8: Asset field validation correctness

*For any* submitted asset input, the validation function SHALL return a field-level error for each field that violates its constraint (ticker not 1–10 uppercase alphanumeric, type not "Stock"/"ETF", sector not in the 8-value taxonomy, non-positive value or cost basis, currency not in "USD"/"EUR"/"RON"), and SHALL accept inputs where all fields satisfy their constraints.

**Validates: Requirements 4.7**

---

### Property 9: Duplicate ticker rejection preserves portfolio

*For any* portfolio state containing N assets, attempting to add a new asset whose ticker symbol is already present SHALL be rejected, and the portfolio SHALL remain unchanged (still N assets with the same values).

**Validates: Requirements 4.8**

---

### Property 10: Asset position threshold indicators

*For any* asset with a given current value, the warning indicator SHALL be present if and only if the value is ≥ $8.00, and the locked indicator SHALL be present if and only if the value is ≥ $10.00 (the locked indicator implies the warning indicator).

**Validates: Requirements 4.5, 4.6**

---

### Property 11: Position weights sum to 100%

*For any* non-empty portfolio of assets with positive current values, the sum of all computed position weight percentages SHALL equal 100% (within a floating-point tolerance of 0.001%).

**Validates: Requirements 4.4**

---

### Property 12: News result count upper bound

*For any* collection of fetched articles of any size, the output of the `getNews` ranking pipeline SHALL contain at most 30 entries.

**Validates: Requirements 5.2**

---

### Property 13: Priority keyword articles rank above non-matching peers

*For any* pair of articles with equal base relevance scores where one article contains a priority keyword in its headline and the other does not, the keyword-matching article SHALL receive a higher final rank.

**Validates: Requirements 5.3**

---

### Property 14: Article rendering completeness

*For any* `NewsArticle` object in the ranked result set, the rendered article component SHALL include a non-empty headline, source, publication timestamp, and at least one relevance tag.

**Validates: Requirements 5.7**

---

### Property 15: Watchlist mutations are isolated from asset positions

*For any* portfolio state, adding or removing items from the Watchlist SHALL leave the `assets` array in exactly the same state (same length, same values, same order) as before the watchlist mutation.

**Validates: Requirements 5.8**

---

### Property 16: News cache minimum TTL

*For any* successful news fetch, a subsequent call to `getNews` made within 15 minutes (simulated clock advance) SHALL return the cached articles and SHALL NOT trigger a new network fetch.

**Validates: Requirements 5.9**

---

### Property 17: Forecasting monthly compounding formula

*For any* valid scenario (principal ≥ 0, monthly contribution > 0, annual growth rate 0 < r ≤ 100, horizon 1–30 years), the projected value at month `n` SHALL equal:

`principal × (1 + r/1200)^n + contribution × [(1 + r/1200)^n − 1] / (r/1200)`

with a floating-point tolerance of 0.01 RON.

**Validates: Requirements 6.3**

---

### Property 18: Forecast gain accounting identity

*For any* scenario result, the `estimatedGain` at each year mark SHALL equal `projectedValue − principal − totalContributions` exactly (no rounding or bookkeeping discrepancy).

**Validates: Requirements 6.8**

---

### Property 19: Multiple scenario independence

*For any* set of N ≥ 2 simultaneous scenarios computed together, each scenario's year marks SHALL be identical to the values produced by computing that scenario in isolation (scenarios do not share state or influence each other's calculations).

**Validates: Requirements 6.6**

---

### Property 20: Snapshot history retention

*For any* sequence of Closing_Snapshot additions (including up to and beyond the first record), every previously added snapshot SHALL still be retrievable from the database after each subsequent addition (no implicit deletion).

**Validates: Requirements 7.2**

---

### Property 21: CSV round-trip preservation

*For any* collection of valid Closing_Snapshots, exporting to CSV and then importing the resulting CSV SHALL reproduce an identical collection of records — same date strings, same numeric field values (within ±0.01 float tolerance), and same currency codes.

**Validates: Requirements 7.3, 7.4**

---

### Property 22: Malformed CSV rows are skipped and logged

*For any* CSV input containing a mix of valid and malformed rows, the import operation SHALL successfully persist all valid rows, SHALL skip all malformed rows, and SHALL record each skipped row's number and reason in the `ImportResult.errors` array without aborting the overall import.

**Validates: Requirements 7.6**

---

### Property 23: Responsive layout breakpoint

*For any* viewport width strictly less than 768px, the dashboard SHALL apply the mobile single-column layout CSS class; for any viewport width of exactly 768px or greater, the dashboard SHALL apply the desktop layout CSS class.

**Validates: Requirements 8.4**

---

## Error Handling

### BNR Rate Fetch Failures

| Condition | Behavior |
|---|---|
| Fetch fails, cache < 24 h old | Return cached rates + `fromCache: true`; UI shows warning with cache age |
| Fetch fails, cache ≥ 24 h old or missing | Throw `BNRError`; UI suppresses net wealth figure and shows error message |
| Fetch succeeds | Update `RateCache` row; clear any warning |

### OCR Failures

| Condition | Behavior |
|---|---|
| Field extraction fails | Field is `null` in `ParsedSnapshot`; listed in `errors`; review form shows empty + editable |
| Extracted value out of range | Field flagged in review form; user must confirm or correct before commit |
| Image file > 10 MB | Rejected at upload; error shown before any parsing |
| Unsupported MIME type | Rejected at upload with descriptive error |

### Database Errors

All Prisma operations are wrapped in try/catch. On failure:
- API route returns HTTP 500 with `{ error: string }` body.
- Client surfaces the error message in a dismissible toast notification.
- For snapshot persistence failures specifically, the review form is kept open with the parsed values intact (Requirement 2.4).

### CSV Import Errors

Malformed rows are skipped; row number + reason recorded in `ImportResult.errors`. Import continues for remaining rows. Final summary shown to user (Requirement 7.6).

### News Fetch Failures

- Source fetch failure: serve cached articles with staleness indicator, or error if no cache.
- Gemini API failure: fall back to keyword ranking (Requirement 5.5).

---

## Testing Strategy

### Dual Testing Approach

Unit tests cover specific examples and edge cases. Property-based tests verify universal properties across many generated inputs. Both layers are necessary for comprehensive correctness coverage.

### Technology Choices

| Layer | Library |
|---|---|
| Unit + integration tests | **Vitest** |
| Property-based tests | **fast-check** (TypeScript-native, minimal setup) |
| React component tests | **React Testing Library** + Vitest |
| E2E (optional) | **Playwright** |

fast-check is chosen over jest-prop-test-runner or hypothesis because it is the de-facto TypeScript PBT library, integrates natively with Vitest's `test` blocks, and requires no extra runner configuration.

### Property Test Configuration

Each property test runs a **minimum of 100 iterations** (fast-check default is 100; set `numRuns: 100` explicitly). Each test is tagged with a comment referencing the design property:

```typescript
// Feature: ai-wealth-dashboard, Property 2: FX penalty is always applied to cross-currency conversions
test('fx penalty applied on cross-currency conversion', () => {
  fc.assert(
    fc.property(fc.float({ min: 0.01, max: 999999 }), fc.float({ min: 1, max: 100 }), (amount, rate) => {
      const rates = { RON_USD: rate, RON_EUR: rate + 0.1, fetchedAt: new Date() };
      const result = toRON(amount, 'USD', rates);
      expect(result).toBeLessThan(amount * rate);
      expect(result).toBeCloseTo(amount * rate * 0.995);
    }),
    { numRuns: 100 }
  );
});
```

### Unit Test Focus Areas

- **BNR_Service**: mock `fetch` to simulate success, 4xx, network failure; verify cache read/write.
- **OCR_Engine**: supply known test images (PNG fixtures) and assert extracted field values.
- **Portfolio_Manager**: Prisma Client Mock; test CRUD, duplicate ticker rejection, overwrite prompts.
- **Delta_Tracker**: example snapshots including zero-crossing, identical, and growing scenarios.
- **Forecasting_Engine**: example scenarios verifying formula arithmetic to 4 decimal places.
- **News_Aggregator**: mock RSS responses; verify filtering, ranking, and cache behavior.

### Integration Test Focus Areas

- Full OCR pipeline: upload fixture image → API → parsed fields returned.
- Snapshot lifecycle: add → export CSV → clear DB → import CSV → verify restored.
- Rate cache lifecycle: cold start fetch → expiry → stale-cache fallback.

### Component Test Focus Areas

- Tab keyboard navigation (ARIA Tabs pattern, Requirement 8.3).
- Responsive breakpoint: render at 767 px (single column) vs 768 px (desktop).
- Delta color rendering: green for positive, red for negative, no color for zero.
- Asset warning and lock indicators at $8.00 and $10.00 thresholds.

---

## Technology Choices

| Concern | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | Familiar to most TS devs; file-based routing; API route handlers eliminate a separate Express server |
| Styling | **Tailwind CSS** | Utility-first; dark theme straightforward with `dark:` variants; no CSS runtime |
| Component library | **shadcn/ui** | Unstyled Radix primitives + Tailwind; full ownership of components; accessible by default |
| Charts | **Recharts** | React-native; supports both line charts (forecast) and pie/donut charts (allocation); good TypeScript types |
| ORM | **Prisma + SQLite** | Type-safe queries; zero-config local SQLite; easy migrations |
| OCR (default) | **Tesseract.js** | Runs in Node.js WASM; no API key required; sufficient for structured XTB screenshots |
| OCR (AI backend) | **Google Gemini API** (`gemini-1.5-flash`) | Multimodal; much higher accuracy for complex screenshots; user-supplied token |
| News AI ranking | **Google Gemini API** | Same token reuse; `gemini-1.5-flash` can batch-score 30 headlines cheaply |
| PBT library | **fast-check** | TypeScript-first; integrates with Vitest; rich arbitraries |
| Image preprocessing | **sharp** | Fast WASM-based image transforms before Tesseract |
| HTTP client | **native fetch** (Node 18+) | No extra dependency for BNR and news RSS fetches |

### Local-First Deployment Considerations

1. **No external auth**: The app is accessed only on `localhost`; no login screen needed.
2. **Data directory**: `./data/` for `config.json`; `./prisma/dev.db` for SQLite. Both should be excluded from version control (`.gitignore`) and can be backed up with a simple file copy.
3. **Environment variables**: `GEMINI_API_KEY` may be set via `.env.local` (Next.js convention) or stored in `config.json`. The `.env.local` approach is preferred for secrets.
4. **Offline resilience**: BNR rates and news articles are cached in SQLite. The dashboard is fully usable offline for historical review, delta inspection, and forecasting when caches are warm.
5. **Startup**: `npm run dev` starts the application. A `README.md` should document the one-time `npx prisma migrate dev` step to create the SQLite file.
6. **Data migration**: Prisma migrations are committed to the repo; running `prisma migrate deploy` on version updates applies schema changes non-destructively.
