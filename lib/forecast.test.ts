import { describe, it, expect } from "vitest";
import { calculateScenario, ScenarioInput } from "./forecast";

// Helper: build a minimal valid scenario
function makeScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
    return {
        id: "test",
        label: "Test",
        monthlyContribution: 500,
        annualGrowthRate: 7,
        horizonYears: 5,
        ...overrides,
    };
}

describe("calculateScenario", () => {
    it("returns one YearMark per year up to horizonYears", () => {
        const result = calculateScenario(0, makeScenario({ horizonYears: 5 }));
        expect(result.yearMarks).toHaveLength(5);
        expect(result.yearMarks.map((m) => m.year)).toEqual([1, 2, 3, 4, 5]);
    });

    it("propagates the scenario id to the result", () => {
        const result = calculateScenario(0, makeScenario({ id: "optimistic" }));
        expect(result.id).toBe("optimistic");
    });

    it("computes projectedValue using the monthly compounding formula", () => {
        // Manual calculation for n = 12 (year 1)
        // principal = 1000, monthlyContrib = 100, annualRate = 12% → monthlyRate = 0.01
        const principal = 1000;
        const monthly = 100;
        const annualRate = 12;
        const monthlyRate = annualRate / 100 / 12; // 0.01
        const n = 12;
        const compoundFactor = Math.pow(1 + monthlyRate, n);
        const expectedFV =
            principal * compoundFactor + monthly * (compoundFactor - 1) / monthlyRate;

        const result = calculateScenario(
            principal,
            makeScenario({
                monthlyContribution: monthly,
                annualGrowthRate: annualRate,
                horizonYears: 1,
            })
        );

        expect(result.yearMarks[0].projectedValue).toBeCloseTo(expectedFV, 4);
    });

    it("totalContributions equals monthlyContribution × months", () => {
        const scenario = makeScenario({
            monthlyContribution: 300,
            horizonYears: 3,
        });
        const result = calculateScenario(0, scenario);

        result.yearMarks.forEach(({ year, totalContributions }) => {
            expect(totalContributions).toBeCloseTo(300 * year * 12, 6);
        });
    });

    it("estimatedGain satisfies the accounting identity at every year mark", () => {
        const principal = 2000;
        const result = calculateScenario(principal, makeScenario());

        for (const { projectedValue, totalContributions, estimatedGain } of result.yearMarks) {
            expect(estimatedGain).toBeCloseTo(
                projectedValue - principal - totalContributions,
                6
            );
        }
    });

    it("zero principal — growth is contributions plus interest only", () => {
        const result = calculateScenario(
            0,
            makeScenario({ monthlyContribution: 100, annualGrowthRate: 0.001, horizonYears: 1 })
        );
        // With near-zero rate, projectedValue ≈ 1200 (12 × 100)
        expect(result.yearMarks[0].projectedValue).toBeGreaterThan(1200);
        expect(result.yearMarks[0].totalContributions).toBeCloseTo(1200, 4);
    });

    it("horizonYears = 1 produces exactly one year mark at year 1", () => {
        const result = calculateScenario(5000, makeScenario({ horizonYears: 1 }));
        expect(result.yearMarks).toHaveLength(1);
        expect(result.yearMarks[0].year).toBe(1);
    });

    it("horizonYears = 30 produces 30 year marks", () => {
        const result = calculateScenario(0, makeScenario({ horizonYears: 30 }));
        expect(result.yearMarks).toHaveLength(30);
        expect(result.yearMarks[29].year).toBe(30);
    });

    it("projectedValue grows monotonically with positive rate and contributions", () => {
        const result = calculateScenario(
            1000,
            makeScenario({ monthlyContribution: 200, annualGrowthRate: 5, horizonYears: 10 })
        );
        for (let i = 1; i < result.yearMarks.length; i++) {
            expect(result.yearMarks[i].projectedValue).toBeGreaterThan(
                result.yearMarks[i - 1].projectedValue
            );
        }
    });
});
