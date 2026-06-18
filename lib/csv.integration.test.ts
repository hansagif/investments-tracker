/**
 * Integration test: snapshot CSV round-trip
 *
 * Tests the full lifecycle: export → import → verify.
 * No database is required — mock ClosingSnapshot objects are passed directly
 * to exportSnapshotsCSV, and the resulting CSV string is fed to importSnapshotsCSV.
 *
 * Requirements: 7.3, 7.4
 */

import { describe, it, expect } from "vitest";
import type { ClosingSnapshot } from "@prisma/client";
import { exportSnapshotsCSV, importSnapshotsCSV } from "./csv";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a ClosingSnapshot-shaped object without touching the database.
 * Only the fields consumed by exportSnapshotsCSV are meaningful;
 * the Prisma-managed fields (id, createdAt, updatedAt) are stubbed.
 */
function makeSnapshot(
    date: string,
    totalTransactionValue: number,
    freeFunds: number,
    netProfitLoss: number,
    currency: string
): ClosingSnapshot {
    return {
        id: `stub-${date}`,
        date,
        totalTransactionValue,
        freeFunds,
        netProfitLoss,
        currency,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    };
}

/** Returns true when two numbers are within the given tolerance of each other. */
function withinTolerance(a: number, b: number, tol = 0.01): boolean {
    return Math.abs(a - b) <= tol;
}

// ─── Round-trip with multiple snapshots ──────────────────────────────────────

describe("CSV round-trip — multiple snapshots", () => {
    const original = [
        makeSnapshot("2024-01-15", 9823.45, 241.6, -12.3, "USD"),
        makeSnapshot("2024-02-01", 10500.0, 350.0, 76.55, "EUR"),
        makeSnapshot("2024-03-20", 8750.75, 125.25, -203.5, "RON"),
    ];

    it("exports then imports the same number of records", () => {
        const csv = exportSnapshotsCSV(original);
        const result = importSnapshotsCSV(csv);

        expect(result.imported).toBe(original.length);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(result.records).toHaveLength(original.length);
    });

    it("preserves dates exactly after round-trip", () => {
        const csv = exportSnapshotsCSV(original);
        const result = importSnapshotsCSV(csv);

        const originalDates = original.map((s) => s.date).sort();
        const importedDates = result.records.map((r) => r.date).sort();
        expect(importedDates).toEqual(originalDates);
    });

    it("preserves currencies exactly after round-trip", () => {
        const csv = exportSnapshotsCSV(original);
        const result = importSnapshotsCSV(csv);

        const byDate = new Map(result.records.map((r) => [r.date, r]));
        for (const snap of original) {
            expect(byDate.get(snap.date)?.currency).toBe(snap.currency);
        }
    });

    it("preserves totalTransactionValue within ±0.01 after round-trip", () => {
        const csv = exportSnapshotsCSV(original);
        const result = importSnapshotsCSV(csv);

        const byDate = new Map(result.records.map((r) => [r.date, r]));
        for (const snap of original) {
            const imported = byDate.get(snap.date);
            expect(imported).toBeDefined();
            expect(
                withinTolerance(imported!.totalTransactionValue, snap.totalTransactionValue)
            ).toBe(true);
        }
    });

    it("preserves freeFunds within ±0.01 after round-trip", () => {
        const csv = exportSnapshotsCSV(original);
        const result = importSnapshotsCSV(csv);

        const byDate = new Map(result.records.map((r) => [r.date, r]));
        for (const snap of original) {
            const imported = byDate.get(snap.date);
            expect(imported).toBeDefined();
            expect(withinTolerance(imported!.freeFunds, snap.freeFunds)).toBe(true);
        }
    });

    it("preserves netProfitLoss within ±0.01 after round-trip", () => {
        const csv = exportSnapshotsCSV(original);
        const result = importSnapshotsCSV(csv);

        const byDate = new Map(result.records.map((r) => [r.date, r]));
        for (const snap of original) {
            const imported = byDate.get(snap.date);
            expect(imported).toBeDefined();
            expect(withinTolerance(imported!.netProfitLoss, snap.netProfitLoss)).toBe(true);
        }
    });
});

// ─── Round-trip with an empty snapshot list ───────────────────────────────────

describe("CSV round-trip — empty snapshot list", () => {
    it("exports an empty list to a header-only CSV string", () => {
        const csv = exportSnapshotsCSV([]);
        expect(csv).toBe("Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency");
    });

    it("imports a header-only CSV with zero records and no errors", () => {
        const csv = exportSnapshotsCSV([]);
        const result = importSnapshotsCSV(csv);

        expect(result.imported).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(result.records).toHaveLength(0);
    });
});

// ─── Round-trip ordering ─────────────────────────────────────────────────────

describe("CSV round-trip — ordering", () => {
    it("exports rows sorted by date ascending regardless of input order", () => {
        const snapshots = [
            makeSnapshot("2024-03-01", 1000, 100, 10, "USD"),
            makeSnapshot("2024-01-01", 2000, 200, 20, "USD"),
            makeSnapshot("2024-02-01", 3000, 300, 30, "USD"),
        ];
        const csv = exportSnapshotsCSV(snapshots);
        const lines = csv.split("\n").slice(1); // drop header
        const dates = lines.map((l) => l.split(",")[0]);
        expect(dates).toEqual(["2024-01-01", "2024-02-01", "2024-03-01"]);
    });

    it("round-trip preserves all records regardless of input order", () => {
        const snapshots = [
            makeSnapshot("2024-03-01", 1000, 100, 10, "USD"),
            makeSnapshot("2024-01-01", 2000, 200, 20, "EUR"),
            makeSnapshot("2024-02-01", 3000, 300, 30, "RON"),
        ];
        const csv = exportSnapshotsCSV(snapshots);
        const result = importSnapshotsCSV(csv);

        expect(result.imported).toBe(3);
        expect(result.records.map((r) => r.date).sort()).toEqual([
            "2024-01-01",
            "2024-02-01",
            "2024-03-01",
        ]);
    });
});
