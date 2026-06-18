// Feature: ai-wealth-dashboard, Property 21: CSV round-trip preservation
import { test, expect } from "vitest";
import * as fc from "fast-check";
import { exportSnapshotsCSV, importSnapshotsCSV } from "./csv";
import type { ClosingSnapshot } from "@prisma/client";

/**
 * Property 21: CSV round-trip preservation
 * Validates: Requirements 7.3, 7.4
 *
 * For any collection of valid snapshot records, exporting to CSV and then
 * importing back must produce identical records within ±0.01 float tolerance.
 * All records must import without errors or skips.
 */
test("Property 21: CSV round-trip preservation", () => {
    fc.assert(
        fc.property(
            fc.array(
                fc.record({
                    id: fc.uuidV(4),
                    date: fc
                        .date({
                            min: new Date("2020-01-01"),
                            max: new Date("2030-12-31"),
                        })
                        .map((d) => d.toISOString().slice(0, 10)), // YYYY-MM-DD
                    totalTransactionValue: fc.float({
                        min: -999999,
                        max: 999999,
                        noNaN: true,
                    }),
                    freeFunds: fc.float({ min: 0, max: 999999, noNaN: true }),
                    netProfitLoss: fc.float({
                        min: -999999,
                        max: 999999,
                        noNaN: true,
                    }),
                    currency: fc.constantFrom("USD", "EUR", "RON"),
                    createdAt: fc.constant(new Date()),
                    updatedAt: fc.constant(new Date()),
                }),
                { minLength: 1, maxLength: 20 }
            ).filter((snapshots) => {
                // Ensure unique dates (required for valid snapshots)
                const dates = snapshots.map((s) => s.date);
                return new Set(dates).size === dates.length;
            }),
            (snapshots) => {
                const csv = exportSnapshotsCSV(snapshots as unknown as ClosingSnapshot[]);
                const result = importSnapshotsCSV(csv);

                // All records should import successfully
                expect(result.imported).toBe(snapshots.length);
                expect(result.skipped).toBe(0);
                expect(result.errors).toHaveLength(0);

                // Records should match within ±0.01 tolerance
                const sorted = [...snapshots].sort((a, b) =>
                    a.date.localeCompare(b.date)
                );

                for (let i = 0; i < sorted.length; i++) {
                    const original = sorted[i];
                    const imported = result.records.find(
                        (r) => r.date === original.date
                    );

                    expect(imported).toBeDefined();
                    expect(
                        Math.abs(
                            imported!.totalTransactionValue -
                            original.totalTransactionValue
                        )
                    ).toBeLessThan(0.01);
                    expect(
                        Math.abs(imported!.freeFunds - original.freeFunds)
                    ).toBeLessThan(0.01);
                    expect(
                        Math.abs(
                            imported!.netProfitLoss - original.netProfitLoss
                        )
                    ).toBeLessThan(0.01);
                    expect(imported!.currency).toBe(original.currency);
                }
            }
        ),
        { numRuns: 25 }
    );
});

// Feature: ai-wealth-dashboard, Property 22: Malformed CSV rows are skipped and logged
test('Property 22: Malformed CSV rows are skipped and logged', () => {
    /**
     * **Validates: Requirements 7.6**
     */
    fc.assert(
        fc.property(
            fc.array(
                fc.record({
                    date: fc.date({ min: new Date('2020-01-01'), max: new Date('2029-12-31') })
                        .map(d => d.toISOString().slice(0, 10)),
                    totalTransactionValue: fc.float({ min: -999999, max: 999999, noNaN: true }),
                    freeFunds: fc.float({ min: 0, max: 999999, noNaN: true }),
                    netProfitLoss: fc.float({ min: -999999, max: 999999, noNaN: true }),
                    currency: fc.constantFrom('USD', 'EUR', 'RON'),
                }),
                { minLength: 1, maxLength: 10 }
            ).filter(snapshots => {
                const dates = snapshots.map(s => s.date);
                return new Set(dates).size === dates.length;
            }),
            fc.array(
                fc.constantFrom(
                    'malformed-line',
                    '2024-01-01,abc,100,100,USD',     // non-numeric
                    '2024-01-01,100,100,100,GBP',     // invalid currency
                    'bad-date,100,100,100,USD',       // bad date
                    '2024-01-01,100,100',             // too few columns
                ),
                { minLength: 0, maxLength: 5 }
            ),
            (validSnapshots, malformedLines) => {
                const header = 'Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency';
                const validLines = validSnapshots.map(s =>
                    `${s.date},${s.totalTransactionValue},${s.freeFunds},${s.netProfitLoss},${s.currency}`
                );

                // Interleave valid and malformed lines
                const allLines = [header, ...validLines, ...malformedLines];
                const csv = allLines.join('\n');

                const result = importSnapshotsCSV(csv);

                // All valid rows should be imported
                expect(result.imported).toBe(validSnapshots.length);

                // All malformed rows should be skipped
                expect(result.skipped).toBe(malformedLines.length);

                // Each malformed row should have an error entry
                expect(result.errors.length).toBe(malformedLines.length);

                // Valid records should match the valid snapshots
                expect(result.records).toHaveLength(validSnapshots.length);
            }
        ),
        { numRuns: 25 }
    );
});
