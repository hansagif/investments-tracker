-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "totalDepositedRON" REAL NOT NULL DEFAULT 0,
    "freeRON" REAL NOT NULL DEFAULT 0,
    "etfValueEUR" REAL NOT NULL DEFAULT 0,
    "etfDepositedEUR" REAL NOT NULL DEFAULT 0,
    "usdTotalValue" REAL NOT NULL DEFAULT 0,
    "usdFreeFunds" REAL NOT NULL DEFAULT 0,
    "usdNetProfitLoss" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DailyEntry" ("createdAt", "date", "etfValueEUR", "freeRON", "id", "totalDepositedRON", "updatedAt", "usdFreeFunds", "usdNetProfitLoss", "usdTotalValue") SELECT "createdAt", "date", "etfValueEUR", "freeRON", "id", "totalDepositedRON", "updatedAt", "usdFreeFunds", "usdNetProfitLoss", "usdTotalValue" FROM "DailyEntry";
DROP TABLE "DailyEntry";
ALTER TABLE "new_DailyEntry" RENAME TO "DailyEntry";
CREATE UNIQUE INDEX "DailyEntry_date_key" ON "DailyEntry"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
