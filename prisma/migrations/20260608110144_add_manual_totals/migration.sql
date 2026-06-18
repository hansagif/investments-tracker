-- CreateTable
CREATE TABLE "ManualTotals" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "totalDepositedRON" REAL NOT NULL DEFAULT 0,
    "etfValueEUR" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
