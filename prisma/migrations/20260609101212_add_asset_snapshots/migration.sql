-- CreateTable
CREATE TABLE "AssetSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "currentValue" REAL NOT NULL,
    "currentPrice" REAL NOT NULL DEFAULT 0,
    "avgBuyPrice" REAL NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "AssetSnapshot_ticker_idx" ON "AssetSnapshot"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "AssetSnapshot_date_ticker_key" ON "AssetSnapshot"("date", "ticker");
