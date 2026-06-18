-- CreateTable
CREATE TABLE "DailyEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "totalDepositedRON" REAL NOT NULL DEFAULT 0,
    "freeRON" REAL NOT NULL DEFAULT 0,
    "etfValueEUR" REAL NOT NULL DEFAULT 0,
    "usdTotalValue" REAL NOT NULL DEFAULT 0,
    "usdFreeFunds" REAL NOT NULL DEFAULT 0,
    "usdNetProfitLoss" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyEntry_date_key" ON "DailyEntry"("date");
