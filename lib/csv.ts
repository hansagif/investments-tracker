/**
 * CSV import/export utilities for ClosingSnapshot records.
 *
 * Export format:
 *   Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency
 *   2024-01-15,9823.45,241.60,-12.30,USD
 *
 * Requirements: 7.3, 7.4, 7.5, 7.6
 */

import type { ClosingSnapshot } from "@prisma/client";

// ─── Constants ────────────────────────────────────────────────────────────────

/** CSV column header row */
export const CSV_HEADER =
    "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency";

/** Valid currency values */
const VALID_CURRENCIES = new Set(["USD", "EUR", "RON"]);

/** ISO 8601 date pattern: YYYY-MM-DD */
const ISO_DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

// ─── Import result types ───────────────────────────────────────────────────────

export interface ImportResult {
    imported: number;
    skipped: number;
    errors: { row: number; reason: string }[];
    /** Valid parsed records ready to persist. */
    records: SnapshotInput[];
}

export interface SnapshotInput {
    date: string;
    totalTransactionValue: number;
    freeFunds: number;
    netProfitLoss: number;
    currency: string;
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Convert an array of ClosingSnapshot records to a CSV string.
 *
 * - First row is the header.
 * - Subsequent rows are sorted by date ascending (ISO 8601 lexicographic sort
 *   is correct for the YYYY-MM-DD format stored in the database).
 * - Numeric values use standard decimal notation (no scientific notation).
 *
 * Requirements: 7.3
 */
export function exportSnapshotsCSV(snapshots: ClosingSnapshot[]): string {
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

    const rows = sorted.map((s) => {
        const total = formatNumber(s.totalTransactionValue);
        const free = formatNumber(s.freeFunds);
        const net = formatNumber(s.netProfitLoss);
        return `${s.date},${total},${free},${net},${s.currency}`;
    });

    return [CSV_HEADER, ...rows].join("\n");
}

// ─── Import ───────────────────────────────────────────────────────────────────

/**
 * Parse a CSV string and return an ImportResult containing valid records and
 * details about any skipped/malformed rows.
 *
 * Parsing rules (Requirements 7.4, 7.5, 7.6):
 *  - Expected columns in order: Date, TotalTransactionValue, FreeFunds,
 *    NetProfitLoss, Currency
 *  - First row is treated as a header and skipped
 *  - Row numbering is 1-based counting from the header row (first data row = row 2)
 *  - Column count must be exactly 5
 *  - Date must be ISO 8601 YYYY-MM-DD
 *  - TotalTransactionValue, FreeFunds, NetProfitLoss must be finite numbers
 *  - Currency must be "USD", "EUR", or "RON"
 *  - Duplicate dates within the CSV: first occurrence wins; subsequent occurrences
 *    are logged as errors
 *  - Processing continues after any error (no early termination)
 */
export function importSnapshotsCSV(csv: string): ImportResult {
    const result: ImportResult = {
        imported: 0,
        skipped: 0,
        errors: [],
        records: [],
    };

    const lines = csv.split(/\r?\n/);

    // Track dates seen in this import to detect intra-file duplicates.
    const seenDates = new Set<string>();

    // Start from index 1 to skip the header row (index 0 = row 1).
    // Data rows begin at index 1 => 1-based row number = index + 1.
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip blank lines silently (not counted as errors or skipped).
        if (line === "") {
            continue;
        }

        const rowNumber = i + 1; // header is row 1, first data row is row 2

        const columns = line.split(",");

        // Validate column count.
        if (columns.length !== 5) {
            result.errors.push({ row: rowNumber, reason: "missing required columns" });
            result.skipped++;
            continue;
        }

        const [rawDate, rawTotal, rawFree, rawNet, rawCurrency] = columns.map(
            (c) => c.trim()
        );

        // Validate date format.
        if (!ISO_DATE_REGEX.test(rawDate)) {
            result.errors.push({ row: rowNumber, reason: "unparseable date" });
            result.skipped++;
            continue;
        }

        // Validate numeric fields.
        const totalTransactionValue = Number(rawTotal);
        const freeFunds = Number(rawFree);
        const netProfitLoss = Number(rawNet);

        if (
            !isFinite(totalTransactionValue) ||
            !isFinite(freeFunds) ||
            !isFinite(netProfitLoss)
        ) {
            result.errors.push({
                row: rowNumber,
                reason: "non-numeric value in numeric field",
            });
            result.skipped++;
            continue;
        }

        // Validate currency.
        if (!VALID_CURRENCIES.has(rawCurrency)) {
            result.errors.push({ row: rowNumber, reason: "invalid currency" });
            result.skipped++;
            continue;
        }

        // Detect duplicate dates within the CSV.
        if (seenDates.has(rawDate)) {
            result.errors.push({ row: rowNumber, reason: "duplicate date in import" });
            result.skipped++;
            continue;
        }

        seenDates.add(rawDate);

        result.records.push({
            date: rawDate,
            totalTransactionValue,
            freeFunds,
            netProfitLoss,
            currency: rawCurrency,
        });
        result.imported++;
    }

    return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a number using standard decimal notation without scientific notation.
 *
 * `toFixed(10)` guarantees no scientific notation even for small values within
 * the ±1,000,000 domain. Trailing zeros after the decimal point are stripped
 * so "9823.00" renders as "9823" and "-12.30" renders as "-12.3".
 */
export function formatNumber(value: number): string {
    return value.toFixed(10).replace(/\.?0+$/, "");
}
