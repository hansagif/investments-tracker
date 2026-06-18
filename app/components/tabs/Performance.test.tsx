/**
 * Component tests for the Performance tab
 *
 * Covers:
 *  - Zero snapshots: shows "A second day of data is required for comparison"
 *  - Single snapshot: shows "A second day of data is required for comparison"
 *  - Two snapshots with positive delta: absolute delta cell has text-green-400
 *  - Two snapshots with negative delta: absolute delta cell has text-red-400
 *  - Two snapshots with zero delta: no color class (neither text-green-400 nor text-red-400)
 *  - Loading state: shows loading indicator
 *  - Error state: shows error message when API fails
 *
 * Requirements: 3.3, 3.4
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Performance } from "./Performance";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal SnapshotRecord shape returned by /api/snapshots */
function makeSnapshot(
    id: string,
    date: string,
    totalTransactionValue: number,
    freeFunds: number,
    netProfitLoss: number
) {
    return { id, date, totalTransactionValue, freeFunds, netProfitLoss };
}

/** Build a fetch mock that returns snapshots + an empty assets list */
function mockFetch(snapshots: ReturnType<typeof makeSnapshot>[]) {
    return vi.fn().mockImplementation((url: string) => {
        if (url === "/api/snapshots") {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => snapshots,
            } as unknown as Response);
        }
        if (url === "/api/assets") {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => [],
            } as unknown as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Performance tab", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Loading state

    it("shows a loading indicator while data is being fetched (Requirement 3.4)", () => {
        // Never-resolving fetch keeps the component in loading state
        global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

        render(<Performance />);

        expect(screen.getByTestId("performance-loading")).toBeInTheDocument();
    });

    // Error state

    it("shows an error message when the snapshots API fails (Requirement 3.4)", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/snapshots") {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: async () => ({ error: "Internal server error" }),
                } as unknown as Response);
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => [],
            } as unknown as Response);
        });

        render(<Performance />);

        await waitFor(() => {
            expect(screen.getByRole("alert")).toBeInTheDocument();
        });

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Failed to load snapshot data"
        );
    });

    // Insufficient data (< 2 snapshots)

    it("shows second day required message when zero snapshots exist (Requirement 3.4)", async () => {
        global.fetch = mockFetch([]);

        render(<Performance />);

        await waitFor(() => {
            expect(
                screen.getByText(/a second day of data is required for comparison/i)
            ).toBeInTheDocument();
        });
    });

    it("shows second day required message when only one snapshot exists (Requirement 3.4)", async () => {
        global.fetch = mockFetch([
            makeSnapshot("s1", "2024-01-01", 10000, 500, 200),
        ]);

        render(<Performance />);

        await waitFor(() => {
            expect(
                screen.getByText(/a second day of data is required for comparison/i)
            ).toBeInTheDocument();
        });
    });

    // Delta color rendering (two snapshots)

    it("applies text-green-400 to the absolute delta cell when delta is positive (Requirement 3.3)", async () => {
        // curr (index 0) > prev (index 1) -> positive delta
        const snapshots = [
            makeSnapshot("s2", "2024-01-02", 11000, 600, 300), // newer
            makeSnapshot("s1", "2024-01-01", 10000, 500, 200), // older
        ];
        global.fetch = mockFetch(snapshots);

        render(<Performance />);

        await waitFor(() => {
            expect(screen.getByText("Day-Over-Day Performance")).toBeInTheDocument();
        });

        const absoluteDeltaCell = screen.getByLabelText(
            /total transaction value absolute delta/i
        );

        expect(absoluteDeltaCell).toHaveClass("text-green-400");
        expect(absoluteDeltaCell).not.toHaveClass("text-red-400");
    });

    it("applies text-red-400 to the absolute delta cell when delta is negative (Requirement 3.3)", async () => {
        // curr (index 0) < prev (index 1) -> negative delta
        const snapshots = [
            makeSnapshot("s2", "2024-01-02", 9000, 400, 100), // newer, lower values
            makeSnapshot("s1", "2024-01-01", 10000, 500, 200), // older, higher values
        ];
        global.fetch = mockFetch(snapshots);

        render(<Performance />);

        await waitFor(() => {
            expect(screen.getByText("Day-Over-Day Performance")).toBeInTheDocument();
        });

        const absoluteDeltaCell = screen.getByLabelText(
            /total transaction value absolute delta/i
        );

        expect(absoluteDeltaCell).toHaveClass("text-red-400");
        expect(absoluteDeltaCell).not.toHaveClass("text-green-400");
    });

    it("applies no color class to the absolute delta cell when delta is zero (Requirement 3.3)", async () => {
        // curr === prev -> zero delta
        const snapshots = [
            makeSnapshot("s2", "2024-01-02", 10000, 500, 200),
            makeSnapshot("s1", "2024-01-01", 10000, 500, 200),
        ];
        global.fetch = mockFetch(snapshots);

        render(<Performance />);

        await waitFor(() => {
            expect(screen.getByText("Day-Over-Day Performance")).toBeInTheDocument();
        });

        const absoluteDeltaCell = screen.getByLabelText(
            /total transaction value absolute delta/i
        );

        expect(absoluteDeltaCell).not.toHaveClass("text-green-400");
        expect(absoluteDeltaCell).not.toHaveClass("text-red-400");
    });
});
