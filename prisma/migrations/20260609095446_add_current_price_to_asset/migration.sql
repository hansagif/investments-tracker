-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "currentValue" REAL NOT NULL,
    "costBasis" REAL NOT NULL,
    "currentPrice" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Asset" ("costBasis", "createdAt", "currency", "currentValue", "id", "name", "sector", "ticker", "type", "updatedAt") SELECT "costBasis", "createdAt", "currency", "currentValue", "id", "name", "sector", "ticker", "type", "updatedAt" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE UNIQUE INDEX "Asset_ticker_key" ON "Asset"("ticker");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
