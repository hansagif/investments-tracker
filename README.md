# 📊 Investments Tracker

A local-first, AI-powered portfolio dashboard for retail investors using the **XTB** brokerage platform. Because XTB exposes no public API, the app relies on manual daily data entry and AI-powered OCR parsing of your XTB closing screenshots. All data stays on your machine — no cloud, no subscriptions.

---

## ✨ Features

| Tab | What it does |
|-----|-------------|
| **Live Dashboard** | Total net wealth in RON (converted from USD + EUR via live BNR rates), portfolio allocation donuts, cumulative return % chart, draggable panel layout |
| **Daily Log** | Drag-and-drop XTB screenshot → Gemini OCR auto-fills portfolio fields; one entry per day stored in SQLite |
| **Performance** | Day-over-day delta tracking, winners/losers breakdown, P&L attribution |
| **Allocation** | Interactive sector exposure, position sizing charts, AI-generated investment tips |
| **News** | AI-filtered financial news ranked by relevance to your holdings and watchlist |
| **Forecast** | Multi-scenario portfolio growth simulation with monthly compounding |
| **Settings** | OCR backend, Gemini API token, news feeds, watchlist, simulation defaults |

**Tech stack:** Next.js 14 · TypeScript · Prisma + SQLite · Tailwind CSS · Recharts · Tesseract.js / Gemini AI

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18.x ([nodejs.org](https://nodejs.org))
- **npm** ≥ 9.x (bundled with Node)
- A [Google Gemini API key](https://aistudio.google.com/app/apikey) *(optional — required for AI OCR, news ranking, and investment tips)*

---

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/investments-tracker.git
cd investments-tracker
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up the database

```bash
npx prisma migrate deploy
```

This creates a local SQLite file at `prisma/dev.db`. Your financial data never leaves your machine.

### 4. Configure the app

Copy the example env file:

```bash
cp .env.local.example .env.local
```

Then open `.env.local` and optionally add your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

> **Alternatively**, you can enter the API key directly in the app's **Settings** tab after starting — it gets saved to `data/config.json` (gitignored).

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📖 How to Use

### Daily workflow

1. **Open Daily Log tab** — the date defaults to today.
2. **Drag & drop your XTB closing screenshot** into the upload zone. Gemini OCR extracts USD total, free funds, and P&L automatically.
3. **Fill in the remaining fields** manually:
   - Total RON deposited (cumulative since account opening)
   - Free RON in XTB (cash not deployed)
   - ETF value in EUR + EUR amount deposited into ETF
4. **Press Save** — the entry is written to the database and all other tabs refresh automatically.

### First-time setup

1. Go to **Settings** and enter your Gemini API key if you want AI features.
2. Add your stock tickers in **Allocation → Manage Assets** so the OCR position extractor can match them.
3. Add tickers to your **Watchlist** in Settings to get news coverage beyond your current holdings.

### Forecast

Open the **Forecast** tab, set monthly contribution, expected annual growth rate, and horizon. Add multiple scenarios to compare optimistic/base/pessimistic paths side by side.

---

## 🔒 Security & Privacy

All data is stored **locally only**:

| File | Contains | Committed? |
|------|----------|------------|
| `prisma/dev.db` | All portfolio history | ❌ gitignored |
| `data/config.json` | API token, settings | ❌ gitignored |
| `data/app.log` | Runtime debug log | ❌ gitignored |
| `.env.local` | Env-level secrets | ❌ gitignored |

The Gemini API key is read from `data/config.json` at runtime and is **never embedded in source code**.

---

## 🛠 Available Scripts

```bash
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run all tests (Vitest)
npm run test:watch   # Run tests in watch mode
npm run test:ui      # Open Vitest UI
npm run test:coverage # Generate coverage report
```

---

## 🗄 Database Management

```bash
# Apply all pending migrations (initial setup or after pulling updates)
npx prisma migrate deploy

# Open Prisma Studio — visual DB browser
npx prisma studio

# Reset the database (⚠️ deletes all data)
npx prisma migrate reset
```

---

## 📁 Project Structure

```
investments-tracker/
├── app/
│   ├── api/                  # Next.js API routes (daily-entry, assets, ocr, rates…)
│   ├── components/tabs/      # Tab components (LiveDashboard, DailyLog, Allocation…)
│   ├── context/              # RefreshContext — cross-tab refresh signal
│   └── settings/             # Settings page
├── components/ui/            # Shared UI primitives (shadcn/ui)
├── lib/                      # Business logic (fx, bnr, delta, forecast, csv, ocr…)
├── prisma/
│   ├── schema.prisma         # DB schema
│   └── dev.db                # SQLite database (gitignored)
├── data/
│   ├── config.json           # Runtime config / API token (gitignored)
│   └── app.log               # Debug log (gitignored)
├── .env.local.example        # Environment variable template
└── next.config.mjs
```

---

## 🧪 Testing

The project has unit, integration, and property-based tests using **Vitest** and **fast-check**.

```bash
npm run test            # Run all tests once
npm run test:coverage   # Coverage report in /coverage
```

---

## 📝 Notes

- The app uses **BNR (National Bank of Romania)** XML feed for live RON/USD and RON/EUR exchange rates. Rates are cached for up to 24 hours with a fallback warning.
- OCR supports two backends: **Tesseract.js** (local, no API key needed) and **Gemini** (more accurate, requires API key). Switch in Settings.
- A 0.5% exchange penalty fee is applied on all cross-currency conversions to reflect real-world spread costs.
- The `eng.traineddata` file in the project root is the Tesseract language model for English OCR.

---

## 📄 License

MIT
