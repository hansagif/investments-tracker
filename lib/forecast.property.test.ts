// Feature: ai-wealth-dashboard, Property 17: Forecasting monthly compounding formula
import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { calculateScenario } from "./forecast";

describe("Forecasting_Engine — property-based tests", () => {
    /**
     * Property 17: Forecasting monthly compounding formula
     * Validates: Requirements 6.3
     *
     * For any principal, monthlyContribution, annualGrowthRate, and horizonYears,
     * each year mark's projectedValue must match the standard monthly compounding
     * formula within ±0.01 RON tolerance.
     */
    test("Property 17: Forecasting monthly compounding formula", () => {
        fc.assert(
            fc.property(
                fc.float({ min: 0, max: Math.fround(1000000), noNaN: true }),   // principal
                fc.float({ min: 1, max: Math.fround(1000000), noNaN: true }),   // monthlyContribution
                fc.float({ min: Math.fround(0.1), max: 100, noNaN: true }),     // annualGrowthRate (%)
                fc.integer({ min: 1, max: 30 }),                                // horizonYears
                (principal, contribution, rate, horizonYears) => {
                    const scenario = {
                        id: "test",
                        label: "Test",
                        monthlyContribution: contribution,
                        annualGrowthRate: rate,
                        horizonYears,
                    };

                    const result = calculateScenario(principal, scenario);
                    const monthlyRate = rate / 100 / 12;

                    for (const yearMark of result.yearMarks) {
                        const n = yearMark.year * 12;
                        const compoundFactor = Math.pow(1 + monthlyRate, n);
                        const expected =
                            principal * compoundFactor +
                            contribution * (compoundFactor - 1) / monthlyRate;

                        // Within ±0.01 RON tolerance
                        expect(Math.abs(yearMark.projectedValue - expected)).toBeLessThan(0.01);
                    }
                }
            ),
            { numRuns: 25 }
        );
    });
});

// Feature: ai-wealth-dashboard, Property 18: Forecast gain accounting identity
/**
 * Property 18: Forecast gain accounting identity
 * Validates: Requirements 6.8
 *
 * estimatedGain === projectedValue − principal − totalContributions
 * at every year mark.
 */
test('Property 18: Forecast gain accounting identity', () => {
    fc.assert(
        fc.property(
            fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
            fc.float({ min: Math.fround(1), max: Math.fround(1000000), noNaN: true }),
            fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
            fc.integer({ min: 1, max: 30 }),
            (principal, contribution, rate, horizonYears) => {
                const scenario = {
                    id: 'test',
                    label: 'Test',
                    monthlyContribution: contribution,
                    annualGrowthRate: rate,
                    horizonYears,
                };

                const result = calculateScenario(principal, scenario);

                for (const { projectedValue, totalContributions, estimatedGain } of result.yearMarks) {
                    // estimatedGain === projectedValue - principal - totalContributions
                    expect(estimatedGain).toBeCloseTo(projectedValue - principal - totalContributions, 6);
                }
            }
        ),
        { numRuns: 25 }
    );
});

// Feature: ai-wealth-dashboard, Property 19: Multiple scenario independence
/**
 * Property 19: Multiple scenario independence
 * Validates: Requirements 6.6
 *
 * Computing N ≥ 2 scenarios jointly (sequentially) and in isolation must produce
 * identical year marks for each scenario. Since calculateScenario is a pure function,
 * no shared mutable state should exist between invocations.
 */
test('Property 19: Multiple scenario independence', () => {
    fc.assert(
        fc.property(
            fc.float({ min: 0, max: Math.fround(100000), noNaN: true }),   // principal
            fc.array(
                fc.record({
                    id: fc.string({ minLength: 1, maxLength: 10 }),
                    label: fc.constant('Test'),
                    monthlyContribution: fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    annualGrowthRate: fc.float({ min: Math.fround(0.1), max: Math.fround(30), noNaN: true }),
                    horizonYears: fc.integer({ min: 1, max: 10 }),
                }),
                { minLength: 2, maxLength: 5 }
            ),
            (principal, scenarios) => {
                // Ensure unique ids
                const uniqueScenarios = scenarios.map((s, i) => ({ ...s, id: `scenario-${i}` }));

                // Compute each scenario in isolation
                const isolatedResults = uniqueScenarios.map(s => calculateScenario(principal, s));

                // Compute all scenarios sequentially (same as "jointly" since calculateScenario is pure)
                const jointResults = uniqueScenarios.map(s => calculateScenario(principal, s));

                // Each scenario's year marks must be identical
                for (let i = 0; i < uniqueScenarios.length; i++) {
                    const isolated = isolatedResults[i].yearMarks;
                    const joint = jointResults[i].yearMarks;

                    expect(isolated.length).toBe(joint.length);
                    for (let j = 0; j < isolated.length; j++) {
                        expect(isolated[j].projectedValue).toBeCloseTo(joint[j].projectedValue, 6);
                        expect(isolated[j].totalContributions).toBeCloseTo(joint[j].totalContributions, 6);
                        expect(isolated[j].estimatedGain).toBeCloseTo(joint[j].estimatedGain, 6);
                    }
                }
            }
        ),
        { numRuns: 25 }
    );
});
