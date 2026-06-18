import { describe, it, expect } from "vitest";
import {
    exportSnapshotsCSV,
    importSnapshotsCSV,
    type SnapshotRecord,
    type SnapshotInput,
} from "./csv";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<SnapshotInput> = {}): SnapshotRecord {
    return {
        id: "test-id",
        date: "2024-01-15",
        totalTransactionValue: 9823.45,
        freeFunds: 241.6,
        netProfitLoss: -12.3,
        currency: "USD",
        createdAt: new Date("2024-01-15"),
        updatedAt: new Date("2024-01-15"),
        ...overrides,
    };
}

const VALID_CSV = [
    "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
    "2024-01-15,9823.45,241.60,-12.30,USD",
    "2024-01-16,9900.00,200.00,50.00,EUR",
].join("\n");

// ---------------------------------------------------------------------------
// exportSnapshotsCSV
// ---------------------------------------------------------------------------

describe("exportSnapshotsCSV", () => {
    it("produces the correct header row", () => {
        const csv = exportSnapshotsCSV([]);
        expect(csv).toBe(
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency"
        );
    });

    it("includes one data row per snapshot", () => {
        const records = [
            makeRecord({ date: "2024-01-15", totalTransactionValue: 9823.45, freeFunds: 241.6, netProfitLoss: -12.3, currency: "USD" }),
        ];
        const csv = exportSnapshotsCSV(records);
        const lines = csv.split("\n");
        expect(lines).toHaveLength(2);
        expect(lines[1]).toBe("2024-01-15,9823.45,241.6,-12.3,USD");
    });

    it("includes all snapshots when there are multiple", () => {
        const records = [
            makeRecord({ id: "1", ticker: "A", date: "2024-01-15" } as any),
            makeRecord({ id: "2", ticker: "B", date: "2024-01-16" } as any),
        ];
        const csv = exportSnapshotsCSV(records);
        const lines = csv.split("\n");
        expect(lines).toHaveLength(3); // header + 2 data rows
    });
});

// ---------------------------------------------------------------------------
// importSnapshotsCSV — happy path
// ---------------------------------------------------------------------------

describe("importSnapshotsCSV — valid input", () => {
    it("parses two valid rows correctly", () => {
        const result = importSnapshotsCSV(VALID_CSV);
        expect(result.imported).toBe(2);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(result.records).toHaveLength(2);
    });

    it("populates record fields correctly", () => {
        const result = importSnapshotsCSV(VALID_CSV);
        const first = result.records[0];
        expect(first.date).toBe("2024-01-15");
        expect(first.totalTransactionValue).toBe(9823.45);
        expect(first.freeFunds).toBe(241.6);
        expect(first.netProfitLoss).toBe(-12.3);
        expect(first.currency).toBe("USD");
    });

    it("accepts RON as a valid currency", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-03-01,5000,100,20,RON",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(1);
        expect(result.records[0].currency).toBe("RON");
    });

    it("handles negative numeric values", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-03-01,-500.5,100.0,-200.0,USD",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(1);
        expect(result.records[0].totalTransactionValue).toBe(-500.5);
        expect(result.records[0].netProfitLoss).toBe(-200.0);
    });

    it("skips blank lines without counting them as errors", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30,USD",
            "",
            "2024-01-16,9900.00,200.00,50.00,EUR",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(2);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);
    });

    it("handles Windows-style CRLF line endings", () => {
        const csv =
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency\r\n2024-01-15,9823.45,241.60,-12.30,USD\r\n";
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(1);
        expect(result.records[0].date).toBe("2024-01-15");
    });
});

// ---------------------------------------------------------------------------
// importSnapshotsCSV — row numbering
// ---------------------------------------------------------------------------

describe("importSnapshotsCSV — row numbering", () => {
    it("reports the first data row as row 2", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "bad-date,100,100,100,USD",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.errors[0].row).toBe(2);
    });

    it("reports subsequent rows with correct row numbers", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30,USD",
            "bad-date,100,100,100,USD",
            "2024-01-17,9900.00,200.00,50.00,EUR",
            "not-a-number,NaN,100,100,USD",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        // Row 3 has a bad date, row 5 has a bad number
        const rowNumbers = result.errors.map((e) => e.row);
        expect(rowNumbers).toContain(3);
        expect(rowNumbers).toContain(5);
    });
});

// ---------------------------------------------------------------------------
// importSnapshotsCSV — column count validation
// ---------------------------------------------------------------------------

describe("importSnapshotsCSV — missing required columns", () => {
    it("skips a row with fewer than 5 columns", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.skipped).toBe(1);
        expect(result.errors[0].reason).toBe("missing required columns");
    });

    it("skips a row with more than 5 columns", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30,USD,extra",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.skipped).toBe(1);
        expect(result.errors[0].reason).toBe("missing required columns");
    });

    it("continues processing valid rows after a column-count error", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30",
            "2024-01-16,9900.00,200.00,50.00,EUR",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.records[0].date).toBe("2024-01-16");
    });
});

// ---------------------------------------------------------------------------
// importSnapshotsCSV — date validation
// ---------------------------------------------------------------------------

describe("importSnapshotsCSV — date validation", () => {
    const badDates = [
        "01-15-2024",   // MM-DD-YYYY
        "2024/01/15",   // wrong separator
        "20240115",     // no separators
        "2024-13-01",   // invalid month
        "2024-01-32",   // invalid day
        "not-a-date",
        "",
    ];

    badDates.forEach((badDate) => {
        it(`rejects date "${badDate}" with reason "unparseable date"`, () => {
            const csv = [
                "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
                `${badDate},100,100,100,USD`,
            ].join("\n");
            const result = importSnapshotsCSV(csv);
            expect(result.skipped).toBe(1);
            expect(result.errors[0].reason).toBe("unparseable date");
        });
    });

    it("accepts a valid ISO 8601 date", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-12-31,100,100,100,USD",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// importSnapshotsCSV — numeric field validation
// ---------------------------------------------------------------------------

describe("importSnapshotsCSV — numeric field validation", () => {
    it("skips row with non-numeric TotalTransactionValue", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,abc,241.60,-12.30,USD",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.skipped).toBe(1);
        expect(result.errors[0].reason).toBe("non-numeric value in numeric field");
    });

    it("skips row with non-numeric FreeFunds", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,abc,-12.30,USD",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.skipped).toBe(1);
        expect(result.errors[0].reason).toBe("non-numeric value in numeric field");
    });

    it("skips row with non-numeric NetProfitLoss", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,abc,USD",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.skipped).toBe(1);
        expect(result.errors[0].reason).toBe("non-numeric value in numeric field");
    });

    it("skips row where a numeric field is Infinity", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,Infinity,241.60,-12.30,USD",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.skipped).toBe(1);
        expect(result.errors[0].reason).toBe("non-numeric value in numeric field");
    });
});

// ---------------------------------------------------------------------------
// importSnapshotsCSV — currency validation
// ---------------------------------------------------------------------------

describe("importSnapshotsCSV — currency validation", () => {
    it("skips row with unsupported currency", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30,GBP",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.skipped).toBe(1);
        expect(result.errors[0].reason).toBe("invalid currency");
    });

    it("skips row with lowercase currency", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30,usd",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.skipped).toBe(1);
        expect(result.errors[0].reason).toBe("invalid currency");
    });

    it("accepts USD, EUR, and RON currencies", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,100,100,100,USD",
            "2024-01-16,100,100,100,EUR",
            "2024-01-17,100,100,100,RON",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(3);
        expect(result.skipped).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// importSnapshotsCSV — duplicate date handling
// ---------------------------------------------------------------------------

describe("importSnapshotsCSV — duplicate dates", () => {
    it("accepts the first occurrence and rejects the second", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30,USD",
            "2024-01-15,9900.00,200.00,50.00,EUR",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.errors[0].reason).toBe("duplicate date in import");
        expect(result.records[0].totalTransactionValue).toBe(9823.45);
    });

    it("reports duplicate at the correct row number", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30,USD",
            "2024-01-15,9900.00,200.00,50.00,EUR",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.errors[0].row).toBe(3);
    });

    it("handles two separate duplicate pairs correctly", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30,USD",
            "2024-01-16,9900.00,200.00,50.00,EUR",
            "2024-01-15,1000.00,100.00,10.00,RON",
            "2024-01-16,2000.00,200.00,20.00,USD",
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(2);
        expect(result.skipped).toBe(2);
        const duplicateErrors = result.errors.filter(
            (e) => e.reason === "duplicate date in import"
        );
        expect(duplicateErrors).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// importSnapshotsCSV — mixed valid and invalid rows
// ---------------------------------------------------------------------------

describe("importSnapshotsCSV — mixed rows", () => {
    it("processes all rows independently regardless of errors", () => {
        const csv = [
            "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency",
            "2024-01-15,9823.45,241.60,-12.30,USD",    // valid -> row 2
            "bad-date,100,100,100,USD",                  // bad date -> row 3
            "2024-01-16,abc,200.00,50.00,EUR",            // bad number -> row 4
            "2024-01-17,9900.00,200.00,50.00,GBP",       // bad currency -> row 5
            "2024-01-18,1000.00,50.00,25.00,RON",        // valid -> row 6
        ].join("\n");
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(2);
        expect(result.skipped).toBe(3);
        expect(result.errors).toHaveLength(3);
        expect(result.records.map((r) => r.date)).toEqual([
            "2024-01-15",
            "2024-01-18",
        ]);
    });

    it("returns zero imported and zero skipped for header-only input", () => {
        const csv = "Date,TotalTransactionValue,FreeFunds,NetProfitLoss,Currency";
        const result = importSnapshotsCSV(csv);
        expect(result.imported).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(result.records).toHaveLength(0);
    });
});
