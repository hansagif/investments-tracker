/**
 * Unit tests for Forecast tab — Requirements 6.2, 6.4
 *
 * Covers:
 *  - Validation: contribution = 0 → "Must be greater than 0 and at most 1,000,000 RON"
 *  - Validation: contribution > 1,000,000 → same error message
 *  - Validation: growth rate = 0 → "Must be greater than 0 and at most 100%"
 *  - Validation: growth rate > 100 → same error message
 *  - Validation: horizon = 0 → "Must be between 1 and 30 years"
 *  - Validation: horizon = 31 → same error message
 *  - Zero-principal: /api/snapshots returns [] → "Simulation based on contributions only"
 *  - Multiple scenarios: "Add Scenario" button adds a second scenario card
 *  - Remove scenario: with 2 scenarios, clicking remove on second leaves 1
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Forecast } from "./Forecast";

// ── Mock Recharts to avoid SVG/ResizeObserver issues in jsdom ──────────────────

vi.mock("recharts", () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
        React.createElement("div", { "data-testid": "recharts-responsive-container" }, children)
    ),
    LineChart: ({ children }: { children: React.ReactNode }) => (
        React.createElement("div", { "data-testid": "recharts-line-chart" }, children)
    ),
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mock /api/snapshots to return an empty array (no principal). */
function mockEmptySnapshots() {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
    } as unknown as Response);
}

/** Mock /api/snapshots to return a single snapshot with a known totalValue. */
function mockSnapshotWithValue(totalValue: number) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ totalValue, date: "2024-01-15" }],
    } as unknown as Response);
}

/**
 * Fill all three required fields for the first scenario and blur each field so
 * validation runs. This is needed to trigger rendering of the chart + notice,
 * because the chart only renders when validScenarios.length > 0.
 */
async function fillValidScenario(
    user: ReturnType<typeof userEvent.setup>,
    overrides: {
        contribution?: string;
        rate?: string;
        horizon?: string;
    } = {}
) {
    const contribution = overrides.contribution ?? "500";
    const rate = overrides.rate ?? "7";
    const horizon = overrides.horizon ?? "10";

    // Get all inputs — use index 0 for the first scenario
    const contribInputs = screen.getAllByLabelText(/monthly contribution/i);
    const rateInputs = screen.getAllByLabelText(/annual growth rate/i);
    const horizonInputs = screen.getAllByLabelText(/horizon/i);

    const contribInput = contribInputs[0];
    const rateInput = rateInputs[0];
    const horizonInput = horizonInputs[0];

    await user.clear(contribInput);
    await user.type(contribInput, contribution);
    await user.tab(); // blur → touch

    await user.clear(rateInput);
    await user.type(rateInput, rate);
    await user.tab();

    await user.clear(horizonInput);
    await user.type(horizonInput, horizon);
    await user.tab();
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Forecast tab — validation errors (Requirement 6.2)", () => {
    beforeEach(() => {
        mockEmptySnapshots();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ── Monthly Contribution ──────────────────────────────────────────────────

    it("shows contribution error when value is 0", async () => {
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        const contribInput = screen.getByLabelText(/monthly contribution/i);
        await user.clear(contribInput);
        await user.type(contribInput, "0");
        await user.tab(); // blur → touch

        await waitFor(() => {
            expect(
                screen.getByText("Must be greater than 0 and at most 1,000,000 RON")
            ).toBeInTheDocument();
        });
    });

    it("shows contribution error when value exceeds 1,000,000", async () => {
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        const contribInput = screen.getByLabelText(/monthly contribution/i);
        await user.clear(contribInput);
        await user.type(contribInput, "1000001");
        await user.tab();

        await waitFor(() => {
            expect(
                screen.getByText("Must be greater than 0 and at most 1,000,000 RON")
            ).toBeInTheDocument();
        });
    });

    // ── Annual Growth Rate ────────────────────────────────────────────────────

    it("shows growth rate error when value is 0", async () => {
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        const rateInput = screen.getByLabelText(/annual growth rate/i);
        await user.clear(rateInput);
        await user.type(rateInput, "0");
        await user.tab();

        await waitFor(() => {
            expect(
                screen.getByText("Must be greater than 0 and at most 100%")
            ).toBeInTheDocument();
        });
    });

    it("shows growth rate error when value exceeds 100", async () => {
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        const rateInput = screen.getByLabelText(/annual growth rate/i);
        await user.clear(rateInput);
        await user.type(rateInput, "101");
        await user.tab();

        await waitFor(() => {
            expect(
                screen.getByText("Must be greater than 0 and at most 100%")
            ).toBeInTheDocument();
        });
    });

    // ── Horizon ───────────────────────────────────────────────────────────────

    it("shows horizon error when value is 0", async () => {
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        const horizonInput = screen.getByLabelText(/horizon/i);
        await user.clear(horizonInput);
        await user.type(horizonInput, "0");
        await user.tab();

        await waitFor(() => {
            expect(
                screen.getByText("Must be between 1 and 30 years")
            ).toBeInTheDocument();
        });
    });

    it("shows horizon error when value is 31", async () => {
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        const horizonInput = screen.getByLabelText(/horizon/i);
        await user.clear(horizonInput);
        await user.type(horizonInput, "31");
        await user.tab();

        await waitFor(() => {
            expect(
                screen.getByText("Must be between 1 and 30 years")
            ).toBeInTheDocument();
        });
    });
});

describe("Forecast tab — zero-principal message (Requirement 6.4)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shows 'Simulation based on contributions only' when snapshots API returns empty array", async () => {
        mockEmptySnapshots();
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        // Fill in a valid scenario so the chart and notice are rendered
        await fillValidScenario(user);

        await waitFor(() => {
            expect(
                screen.getByText(
                    /simulation based on contributions only/i
                )
            ).toBeInTheDocument();
        });
    });

    it("does not show zero-principal message when snapshots exist (principal > 0)", async () => {
        mockSnapshotWithValue(5000);
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        await fillValidScenario(user);

        await waitFor(() => {
            expect(
                screen.queryByText(/simulation based on contributions only/i)
            ).not.toBeInTheDocument();
        });
    });
});

describe("Forecast tab — multiple scenarios (Requirement 6.6)", () => {
    beforeEach(() => {
        mockEmptySnapshots();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders one scenario card initially", async () => {
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        // There should be exactly one "Monthly Contribution" input visible
        const contribInputs = screen.getAllByLabelText(/monthly contribution/i);
        expect(contribInputs).toHaveLength(1);
    });

    it("clicking 'Add Scenario' adds a second scenario card", async () => {
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        const addButton = screen.getByRole("button", { name: /add scenario/i });
        await user.click(addButton);

        // Now there should be two Monthly Contribution inputs
        const contribInputs = screen.getAllByLabelText(/monthly contribution/i);
        expect(contribInputs).toHaveLength(2);
    });

    it("both scenario forms are visible after adding a second scenario", async () => {
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        const addButton = screen.getByRole("button", { name: /add scenario/i });
        await user.click(addButton);

        // Two Annual Growth Rate inputs should be present
        const rateInputs = screen.getAllByLabelText(/annual growth rate/i);
        expect(rateInputs).toHaveLength(2);

        // Two Horizon inputs should be present
        const horizonInputs = screen.getAllByLabelText(/horizon/i);
        expect(horizonInputs).toHaveLength(2);
    });
});

describe("Forecast tab — remove scenario", () => {
    beforeEach(() => {
        mockEmptySnapshots();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("with 2 scenarios, clicking remove on the second leaves only 1", async () => {
        const user = userEvent.setup();
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        // Add a second scenario
        await user.click(screen.getByRole("button", { name: /add scenario/i }));

        // Verify 2 scenarios present
        expect(screen.getAllByLabelText(/monthly contribution/i)).toHaveLength(2);

        // Remove buttons only appear when canRemove is true (i.e., >1 scenario)
        const removeButtons = screen.getAllByRole("button", { name: /remove/i });
        expect(removeButtons).toHaveLength(2);

        // Click the second remove button
        await user.click(removeButtons[1]);

        // Now only 1 scenario should remain
        await waitFor(() => {
            expect(screen.getAllByLabelText(/monthly contribution/i)).toHaveLength(1);
        });
    });

    it("the single remaining scenario cannot be removed (no remove button shown)", async () => {
        render(<Forecast />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());

        // With only 1 scenario, canRemove is false → no remove button
        expect(
            screen.queryByRole("button", { name: /remove/i })
        ).not.toBeInTheDocument();
    });
});
