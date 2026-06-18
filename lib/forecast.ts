/**
 * Forecasting_Engine — pure mathematical functions for compounding simulation.
 *
 * Monthly compounding formula (standard future-value with regular contributions):
 *
 *   monthlyRate = annualGrowthRate / 100 / 12
 *
 *   FV(n) = principal × (1 + monthlyRate)^n
 *         + monthlyContribution × [(1 + monthlyRate)^n − 1] / monthlyRate
 *
 * where n is the number of months elapsed.
 * Year marks are recorded at n = 12, 24, 36 … horizonYears × 12.
 */

export interface ScenarioInput {
    id: string;
    label: string;
    monthlyContribution: number; // RON > 0
    annualGrowthRate: number;    // 0 < x ≤ 100 (percent)
    horizonYears: number;        // 1–30
}

export interface YearMark {
    year: number;
    projectedValue: number;
    totalContributions: number;
    estimatedGain: number;
}

export interface ScenarioResult {
    id: string;
    yearMarks: YearMark[];
}

/**
 * Compute the projected future value at month `n` using monthly compounding.
 *
 * @param principal       Starting portfolio value in RON (≥ 0)
 * @param monthlyContrib  Regular monthly contribution in RON (> 0)
 * @param monthlyRate     Monthly interest rate (annualRate / 100 / 12)
 * @param n               Number of months elapsed
 */
function futureValue(
    principal: number,
    monthlyContrib: number,
    monthlyRate: number,
    n: number
): number {
    const compoundFactor = Math.pow(1 + monthlyRate, n);
    return (
        principal * compoundFactor +
        monthlyContrib * (compoundFactor - 1) / monthlyRate
    );
}

/**
 * Calculate projected growth for a single scenario.
 *
 * Returns a `ScenarioResult` whose `yearMarks` array has one entry per year
 * from year 1 to `scenario.horizonYears` (inclusive).  Each entry captures:
 *   - `projectedValue`      — FV at that year mark
 *   - `totalContributions`  — monthlyContribution × months elapsed
 *   - `estimatedGain`       — projectedValue − principal − totalContributions
 *
 * @param principal  Starting value in RON (≥ 0)
 * @param scenario   Scenario parameters
 */
export function calculateScenario(
    principal: number,
    scenario: ScenarioInput
): ScenarioResult {
    const monthlyRate = scenario.annualGrowthRate / 100 / 12;
    const yearMarks: YearMark[] = [];

    for (let year = 1; year <= scenario.horizonYears; year++) {
        const n = year * 12; // months elapsed at this year mark
        const projectedValue = futureValue(
            principal,
            scenario.monthlyContribution,
            monthlyRate,
            n
        );
        const totalContributions = scenario.monthlyContribution * n;
        const estimatedGain = projectedValue - principal - totalContributions;

        yearMarks.push({
            year,
            projectedValue,
            totalContributions,
            estimatedGain,
        });
    }

    return {
        id: scenario.id,
        yearMarks,
    };
}
