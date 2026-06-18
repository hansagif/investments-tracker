# Requirements Document

## Introduction

A local-first web application providing a personalized AI-powered wealth and portfolio dashboard for retail investors using the XTB broker platform. Since XTB does not expose a public API, the application relies on manual data entry and AI-powered OCR parsing of daily closing screenshots. The dashboard aggregates total net wealth in RON, tracks day-over-day performance, maps asset allocation, surfaces contextual financial news filtered by AI, and simulates future portfolio growth. The application is deployed locally (Next.js) and uses a local database for persistence.

## Glossary

- **Dashboard**: The main web application interface, organized as a multi-tab layout.
- **XTB**: The user's brokerage platform. Does not provide a public API.
- **OCR_Engine**: The subsystem responsible for parsing uploaded XTB closing screenshots into structured data.
- **BNR_Service**: The subsystem that fetches official daily exchange rates from the National Bank of Romania XML/JSON feed.
- **FX_Converter**: The subsystem that applies exchange rate data and a fixed penalty fee to convert monetary values across currencies.
- **Delta_Tracker**: The subsystem that compares the current day's parsed data against the previous day's entry.
- **Portfolio_Manager**: The subsystem that stores, retrieves, and manages the user's asset positions and historical closing data.
- **News_Aggregator**: The subsystem that fetches, filters, and ranks financial news relevant to the user's holdings and watchlist.
- **Forecasting_Engine**: The subsystem that simulates future portfolio growth based on user-defined variables.
- **RON**: Romanian Leu — the target base currency for all net wealth calculations.
- **USD**: United States Dollar.
- **EUR**: Euro.
- **Exchange_Penalty_Fee**: A fixed 0.5% fee applied on all cross-currency conversions to reflect real-world spread/fee costs.
- **Closing_Snapshot**: A single day's parsed portfolio data record, containing Total Transaction Value, Free Funds, and Net Profit/Loss.
- **Delta**: The absolute and percentage difference in portfolio value between two consecutive Closing_Snapshots.
- **Asset**: An individual investment position held in the portfolio (stock or ETF).
- **Position_Limit**: The strict maximum value of $10 applied to any single asset position.
- **Watchlist**: A user-defined list of financial instruments monitored for news, beyond current holdings.

---

## Requirements

### Requirement 1: Multi-Currency Net Wealth Display

**User Story:** As an investor, I want to see my total net wealth converted to RON in real time, so that I can understand my portfolio's value in my local currency.

#### Acceptance Criteria

1. THE Dashboard SHALL display Total Net Wealth expressed in RON on the main tab.
2. WHEN the Dashboard loads, THE BNR_Service SHALL fetch the latest official RON/USD and RON/EUR exchange rates from the BNR XML/JSON feed.
3. IF the BNR_Service fails to fetch exchange rates AND cached rates exist that are less than 24 hours old, THEN THE Dashboard SHALL display the cached exchange rates and SHALL show a warning label indicating the elapsed time since the last successful fetch (expressed in hours and minutes). IF the BNR_Service fails AND no cached rates exist OR cached rates are 24 hours or older, THEN THE Dashboard SHALL suppress the Total Net Wealth display and SHALL show an error message indicating that live rates are unavailable and no valid cache exists.
4. THE FX_Converter SHALL apply an Exchange_Penalty_Fee of 0.5% to all cross-currency conversions.
5. THE Dashboard SHALL display a live FX ticker showing the current RON/USD and RON/EUR rates used for calculations.
6. THE Dashboard SHALL display Total Deposits alongside Current Portfolio Value to allow direct comparison.
7. WHEN exchange rates are successfully updated, THE BNR_Service SHALL record the fetch timestamp; this timestamp SHALL be used as the reference point for the 24-hour staleness threshold in Criterion 3.

---

### Requirement 2: Screenshot Ingestion & OCR Parsing

**User Story:** As an investor, I want to upload my daily XTB closing screenshot and have it automatically parsed, so that I do not need to manually re-enter portfolio figures each day.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a drag-and-drop upload zone on the Screenshot Ingestion tab accepting image files (PNG, JPG, JPEG, WEBP) up to a maximum file size of 10 MB.
2. WHEN an image file is uploaded, THE OCR_Engine SHALL extract the following fields from the screenshot: Total Transaction Value, Free Funds, and Net Profit/Loss.
3. WHEN extraction completes (regardless of whether extraction succeeded fully or partially), THE OCR_Engine SHALL present the parsed values to the user for review in an editable form before committing to storage, so the user may correct any individual field.
4. WHEN the user confirms parsed values, THE Portfolio_Manager SHALL append a new Closing_Snapshot record with the parsed figures and the user's device local date to the timeline database. IF the Portfolio_Manager fails to persist the record due to a database or storage error, THEN THE Dashboard SHALL display an error message naming the failure reason, SHALL retain the parsed values in the review form, and SHALL keep the confirm action available so the user may retry.
5. IF the OCR_Engine cannot extract one or more required fields from the uploaded image, THEN THE Dashboard SHALL display an error message naming each failed field, and SHALL pre-fill those fields as empty and editable in the review form so the user may enter the values manually.
6. IF a Closing_Snapshot already exists for the current local date, THEN THE Dashboard SHALL prompt the user to confirm whether to overwrite the existing record. IF the user declines, THE Dashboard SHALL dismiss the prompt, retain the existing record unchanged, and keep the review form accessible.
7. THE OCR_Engine SHALL use Tesseract.js as the default parsing backend. WHERE the user configures an alternative backend (e.g., the Gemini API multimodal endpoint) in application settings, THE OCR_Engine SHALL use the configured alternative instead.
8. WHEN the user submits an image for OCR parsing, THE OCR_Engine SHALL validate that all extracted numeric values for Total Transaction Value, Free Funds, and Net Profit/Loss fall within the range of -1,000,000 to +1,000,000. IF any extracted value falls outside this range, THE Dashboard SHALL flag that field in the review form and require the user to confirm or correct the value before committing.

---

### Requirement 3: Day-Over-Day Performance Delta Tracking

**User Story:** As an investor, I want to compare today's closing values against yesterday's, so that I can immediately see how my portfolio performed during the day.

#### Acceptance Criteria

1. WHEN at least two Closing_Snapshots exist in the database, THE Delta_Tracker SHALL calculate the absolute Delta and percentage Delta using the two most recent records ordered by stored date descending.
2. WHEN at least two Closing_Snapshots exist in the database, THE Delta_Tracker SHALL display the Delta for Total Transaction Value, Free Funds, and Net Profit/Loss separately.
3. THE Dashboard SHALL render positive Deltas in green, negative Deltas in red, and SHALL apply no color formatting when a Delta is exactly zero.
4. WHEN only one Closing_Snapshot exists, THE Delta_Tracker SHALL display a message indicating that a second day of data is required for comparison.
5. WHEN at least two Closing_Snapshots exist, THE Delta_Tracker SHALL list the top 5 Asset positions with the largest positive absolute change in value (winners) and the top 5 Asset positions with the largest negative absolute change in value (losers) for the period between the two most recent snapshots.
6. WHEN at least two Closing_Snapshots exist, THE Delta_Tracker SHALL display a Source of Gain/Loss attribution breakdown expressing each attribution component (price appreciation, currency movement, new deposits) in both absolute RON and percentage of total Delta. IF attribution data is unavailable for one or more components, THEN THE Delta_Tracker SHALL display "N/A" for those components rather than omitting the attribution section.

---

### Requirement 4: Portfolio Allocation & Spread Mapping

**User Story:** As an investor, I want to visualize how my capital is distributed across assets, sectors, and instrument types, so that I can manage concentration and diversification.

#### Acceptance Criteria

1. THE Portfolio_Manager SHALL support a maximum portfolio of 11 concurrent Asset positions.
2. WHILE at least one Asset position exists, THE Dashboard SHALL render an interactive donut chart showing the percentage split between Stocks and ETFs within the current portfolio.
3. WHILE at least one Asset position exists, THE Dashboard SHALL render an interactive donut chart showing Sector Exposure across all current Asset positions using the following sector taxonomy: Technology, Healthcare, Finance, Energy, Consumer, Industrial, Real Estate, and Other.
4. WHILE at least one Asset position exists, THE Dashboard SHALL render an interactive donut chart showing Position Sizing — the relative weight of each Asset as a percentage of the sum of all Asset current values.
5. WHEN an Asset's current value is greater than or equal to $8.00 (80% of the Position_Limit), THE Dashboard SHALL highlight that position with a distinct visual warning indicator different from the locked indicator defined in Criterion 6.
6. WHEN an Asset's current value reaches the Position_Limit of $10.00, THE Dashboard SHALL display that Asset position as locked with a distinct visual indicator.
7. WHEN the user submits a new Asset position, THE Portfolio_Manager SHALL validate that: the ticker symbol is 1–10 uppercase alphanumeric characters, the instrument type is one of "Stock" or "ETF", the sector is one of the taxonomy values from Criterion 3, the current value is a positive number, the cost basis is a positive number, and the currency is one of "USD", "EUR", or "RON". THE Dashboard SHALL display a field-level validation error for any field that fails these checks.
8. IF the user submits a new Asset position with a ticker symbol that already exists in the portfolio, THEN THE Portfolio_Manager SHALL reject the submission and THE Dashboard SHALL display an error message indicating a duplicate ticker.

---

### Requirement 5: AI-Filtered Contextual News Aggregator

**User Story:** As an investor, I want to see financial news filtered to my specific holdings and watchlist, so that I can act on relevant information without manually sorting through general market noise.

#### Acceptance Criteria

1. WHEN the user opens the News tab or triggers a manual refresh, THE News_Aggregator SHALL fetch news articles from at least one configured financial RSS feed or news API (e.g., NewsAPI, Yahoo Finance free tier).
2. WHEN news articles are fetched, THE News_Aggregator SHALL filter and rank articles based on relevance to the user's current Asset positions and Watchlist, displaying a maximum of 30 articles.
3. THE News_Aggregator SHALL apply priority weighting to articles matching the following keywords: "Nvidia Blackwell", "SpaceX IPO", "Broadcom earnings", "Quantum Computing", "Palantir defense contracts". This weighting step SHALL execute on every ranked result set regardless of whether any articles match the keywords.
4. WHERE the user provides a personal Gemini API token, THE News_Aggregator SHALL use the Gemini API to perform AI-based relevance scoring on fetched articles as the primary ranking signal.
5. IF the Gemini API is unavailable (due to network error, timeout, or invalid/missing token) or no API token is configured, THEN THE News_Aggregator SHALL fall back to keyword-based filtering using the user's ticker symbols and the priority keywords defined in Criterion 3.
6. IF the news source fetch fails, THEN THE News_Aggregator SHALL display the most recently cached articles (if available) with a visible staleness indicator, or display an error message if no cache exists.
7. THE News_Aggregator SHALL display each article with: headline, source, publication timestamp, and a relevance tag indicating which holding or keyword triggered inclusion.
8. THE Dashboard SHALL allow the user to add and remove items from the Watchlist without modifying current Asset positions.
9. WHEN news articles are fetched, THE News_Aggregator SHALL cache the results for a minimum of 15 minutes to avoid redundant API calls.

---

### Requirement 6: Financial Forecasting & Portfolio Simulation

**User Story:** As an investor, I want to simulate my portfolio's future growth under different scenarios, so that I can set realistic expectations and plan monthly contributions.

#### Acceptance Criteria

1. THE Forecasting_Engine SHALL allow the user to input the following simulation variables per scenario: monthly contribution amount in RON (greater than 0), projected annual growth rate as a percentage (greater than 0 and up to 100%), and simulation horizon in years (1 to 30 years, supporting at minimum 1, 3, and 5-year horizons).
2. WHEN the user submits simulation variables, THE Forecasting_Engine SHALL validate that the monthly contribution amount is greater than zero and not greater than 1,000,000 RON, the projected annual growth rate is greater than zero and not greater than 100%, and the simulation horizon is between 1 and 30 years inclusive. THE Forecasting_Engine SHALL display a field-level validation error for any input that fails these checks.
3. WHEN simulation variables are provided, THE Forecasting_Engine SHALL calculate projected portfolio value at each year mark using monthly compounding applied to the current portfolio value as the starting principal plus the specified monthly contributions.
4. IF the current portfolio value is zero (no Closing_Snapshots exist), THEN THE Forecasting_Engine SHALL use zero as the starting principal and SHALL display an informational message indicating that the simulation is based on contributions only.
5. WHEN simulation results are calculated, THE Dashboard SHALL render them as an interactive line chart displaying projected portfolio growth over the selected time horizon.
6. THE Forecasting_Engine SHALL support multiple simultaneous simulation scenarios (each with independently configurable growth rate, monthly contribution, and horizon) so the user can compare optimistic, base, and pessimistic growth paths on the same chart.
7. WHEN the user modifies simulation variables for any scenario, THE Forecasting_Engine SHALL recalculate and re-render the chart without requiring a full page reload.
8. WHEN simulation results are calculated, THE Forecasting_Engine SHALL display a summary table alongside the chart showing projected value, total contributions, and estimated gain for each year mark in each scenario.

---

### Requirement 7: Data Persistence & Local Storage

**User Story:** As an investor, I want all my portfolio history and settings preserved locally, so that I retain full control of my data without depending on external cloud services.

#### Acceptance Criteria

1. THE Portfolio_Manager SHALL persist all Closing_Snapshot records in a local SQLite database file stored within the application's data directory.
2. THE Portfolio_Manager SHALL preserve the full history of all Closing_Snapshots, retaining records indefinitely unless explicitly deleted by the user.
3. WHEN the user triggers a data export, THE Dashboard SHALL generate and download a CSV file containing all stored Closing_Snapshot records.
4. WHEN the user uploads a CSV file for import, THE Portfolio_Manager SHALL parse rows expecting the following columns in order: Date (ISO 8601 format), Total Transaction Value (numeric), Free Funds (numeric), Net Profit/Loss (numeric), Currency (USD or EUR).
5. IF an imported CSV row contains a date that already has a Closing_Snapshot, THEN THE Portfolio_Manager SHALL prompt the user to choose between skipping or overwriting the conflicting record. IF the user cancels the import dialog, no records SHALL be written.
6. IF an imported CSV row is malformed (missing required columns, non-numeric values in numeric fields, or unparseable date), THEN THE Portfolio_Manager SHALL skip that row, record it in an import error log, and continue processing remaining rows. After import completes, THE Dashboard SHALL display a summary of how many rows were imported successfully and how many were skipped with errors.
7. THE Portfolio_Manager SHALL store user configuration settings (Watchlist, API tokens, simulation defaults) in a separate configuration file within the application's data directory, distinct from the Closing_Snapshot database.

---

### Requirement 8: Application Interface & Theming

**User Story:** As an investor, I want a clean, dark-themed multi-tab interface, so that the dashboard is comfortable to use during late-day market close review sessions.

#### Acceptance Criteria

1. THE Dashboard SHALL implement a dark theme as the default visual style with a minimum contrast ratio of 4.5:1 (WCAG AA) between text and background colors.
2. THE Dashboard SHALL organize all features across the following six named tabs with "Live Dashboard" as the default active tab on load: "Live Dashboard", "Daily Log", "Performance", "Allocation", "News", and "Forecast".
3. THE Dashboard SHALL support keyboard navigation for the six main tab sections following the ARIA Tabs pattern: Tab key to move focus to the tab list, Arrow keys to navigate between tabs, and Enter or Space to activate the focused tab.
4. WHEN the application is accessed on a viewport strictly narrower than 768px, THE Dashboard SHALL reflow layout to a single-column mobile-friendly format. Viewports at exactly 768px wide SHALL use the desktop layout.
5. WHEN the user switches between tabs, THE Dashboard SHALL render all charts and data tables within 500ms without requiring a page reload. IF rendering takes longer than 500ms, THE Dashboard SHALL display a loading indicator until rendering completes.
