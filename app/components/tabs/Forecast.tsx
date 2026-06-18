"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ScenarioInput, ScenarioResult } from "@/lib/forecast";
import { calculateScenario } from "@/lib/forecast";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

// ── Chart color palette ───────────────────────────────────────────────────────

const CHART_COLORS = [
    "#6366f1", // indigo
    "#22c55e", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#06b6d4", // cyan
    "#a855f7", // purple
    "#f97316", // orange
    "#14b8a6", // teal
];

// ── Validation ────────────────────────────────────────────────────────────────

interface ScenarioErrors {
    monthlyContribution?: string;
    annualGrowthRate?: string;
    horizonYears?: string;
}

function validateScenario(
    monthlyContribution: string,
    annualGrowthRate: string,
    horizonYears: string
): ScenarioErrors {
    const errors: ScenarioErrors = {};

    const contrib = parseFloat(monthlyContribution);
    if (
        monthlyContribution.trim() === "" ||
        isNaN(contrib) ||
        contrib <= 0 ||
        contrib > 1_000_000
    ) {
        errors.monthlyContribution =
            "Must be greater than 0 and at most 1,000,000 RON";
    }

    const rate = parseFloat(annualGrowthRate);
    if (
        annualGrowthRate.trim() === "" ||
        isNaN(rate) ||
        rate <= 0 ||
        rate > 100
    ) {
        errors.annualGrowthRate = "Must be greater than 0 and at most 100%";
    }

    const horizon = parseFloat(horizonYears);
    if (
        horizonYears.trim() === "" ||
        isNaN(horizon) ||
        !Number.isInteger(horizon) ||
        horizon < 1 ||
        horizon > 30
    ) {
        errors.horizonYears = "Must be between 1 and 30 years";
    }

    return errors;
}

// ── Scenario form state ───────────────────────────────────────────────────────

interface ScenarioFormState {
    /** Unique form id */
    formId: string;
    label: string;
    monthlyContribution: string;
    annualGrowthRate: string;
    horizonYears: string;
    errors: ScenarioErrors;
    touched: Partial<Record<keyof ScenarioErrors, boolean>>;
}

let scenarioCounter = 0;

function createEmptyScenario(): ScenarioFormState {
    scenarioCounter += 1;
    return {
        formId: `scenario-${scenarioCounter}`,
        label: `Scenario ${scenarioCounter}`,
        monthlyContribution: "",
        annualGrowthRate: "",
        horizonYears: "",
        errors: {},
        touched: {},
    };
}

// ── RON formatter for Y-axis ──────────────────────────────────────────────────

function formatRON(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return value.toFixed(0);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Forecast() {
    const [scenarios, setScenarios] = React.useState<ScenarioFormState[]>(() => [
        createEmptyScenario(),
    ]);
    const [principal, setPrincipal] = React.useState<number>(0);
    const [loadingPrincipal, setLoadingPrincipal] = React.useState(true);
    const [ronEur, setRonEur] = React.useState<number | null>(null);

    // Check whether any snapshots exist and derive current principal (req 6.4)
    React.useEffect(() => {
        setLoadingPrincipal(true);
        fetch("/api/snapshots")
            .then((res) => res.json())
            .then((data: unknown) => {
                if (Array.isArray(data) && data.length > 0) {
                    const latest = data[data.length - 1] as Record<string, unknown>;
                    const total =
                        typeof latest.totalValue === "number" ? latest.totalValue : 0;
                    setPrincipal(total);
                } else {
                    setPrincipal(0);
                }
            })
            .catch(() => setPrincipal(0))
            .finally(() => setLoadingPrincipal(false));

        // Fetch live RON/EUR rate for EUR conversion
        fetch("/api/rates")
            .then(r => r.json())
            .then((d: { rates?: { RON_EUR?: number } }) => {
                if (d.rates?.RON_EUR) setRonEur(d.rates.RON_EUR);
            })
            .catch(() => {});
    }, []);

    const hasSnapshots = principal > 0;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function updateScenario(
        formId: string,
        field: "monthlyContribution" | "annualGrowthRate" | "horizonYears" | "label",
        value: string
    ) {
        setScenarios((prev) =>
            prev.map((s) => {
                if (s.formId !== formId) return s;

                const updated = { ...s, [field]: value };

                // Re-validate on change once a field has been touched
                if (field !== "label") {
                    const errorField = field as keyof ScenarioErrors;
                    if (updated.touched[errorField]) {
                        updated.errors = validateScenario(
                            updated.monthlyContribution,
                            updated.annualGrowthRate,
                            updated.horizonYears
                        );
                    }
                }

                return updated;
            })
        );
    }

    function blurScenarioField(formId: string, field: keyof ScenarioErrors) {
        setScenarios((prev) =>
            prev.map((s) => {
                if (s.formId !== formId) return s;
                const touched = { ...s.touched, [field]: true };
                const errors = validateScenario(
                    s.monthlyContribution,
                    s.annualGrowthRate,
                    s.horizonYears
                );
                return { ...s, touched, errors };
            })
        );
    }

    function addScenario() {
        setScenarios((prev) => [...prev, createEmptyScenario()]);
    }

    function removeScenario(formId: string) {
        setScenarios((prev) => {
            if (prev.length <= 1) return prev; // keep at least 1
            return prev.filter((s) => s.formId !== formId);
        });
    }

    /**
     * Derive validated ScenarioInput objects for downstream use (chart / table).
     * Returns null for any scenario that still has validation errors.
     */
    function toValidScenarios(): (ScenarioInput | null)[] {
        return scenarios.map((s) => {
            const errors = validateScenario(
                s.monthlyContribution,
                s.annualGrowthRate,
                s.horizonYears
            );
            if (Object.keys(errors).length > 0) return null;
            return {
                id: s.formId,
                label: s.label || s.formId,
                monthlyContribution: parseFloat(s.monthlyContribution),
                annualGrowthRate: parseFloat(s.annualGrowthRate),
                horizonYears: parseInt(s.horizonYears, 10),
            };
        });
    }

    // ── Chart data derivation (req 6.5, 6.7) ─────────────────────────────────
    // Recalculates automatically whenever scenarios or principal changes.

    const validScenarios = React.useMemo(
        () => toValidScenarios().filter((s): s is ScenarioInput => s !== null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [scenarios, principal]
    );

    // ── Scenario results for summary table (req 6.8) ──────────────────────────
    const scenarioResults = React.useMemo(
        () => validScenarios.map((s) => ({ scenario: s, result: calculateScenario(principal, s) })),
        [validScenarios, principal]
    );

    /**
     * Build a unified data array for Recharts.
     * Each entry: { year: number, [scenarioLabel]: projectedValue }
     * We span years from 1 to the maximum horizonYears across all valid scenarios.
     */
    const chartData = React.useMemo(() => {
        if (validScenarios.length === 0) return [];

        const maxHorizon = Math.max(...validScenarios.map((s) => s.horizonYears));
        const results = validScenarios.map((s) => calculateScenario(principal, s));

        return Array.from({ length: maxHorizon }, (_, i) => {
            const year = i + 1;
            const entry: Record<string, number> = { year };
            for (const result of results) {
                const scenario = validScenarios.find((s) => s.id === result.id)!;
                const mark = result.yearMarks.find((m) => m.year === year);
                if (mark !== undefined) {
                    entry[scenario.label] = mark.projectedValue;
                }
            }
            return entry;
        });
    }, [validScenarios, principal]);

    // ── Render ────────────────────────────────────────────────────────────────

    if (loadingPrincipal) {
        return (
            <div className="space-y-6" data-testid="forecast-loading">
                <Skeleton className="h-8 w-32" />
                {/* Skeleton: Scenario card */}
                <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-7 w-40" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="space-y-1">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ))}
                    </div>
                </div>
                <Skeleton className="h-9 w-32" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Forecast
            </h2>

            {/* Scenario cards */}
            <div className="space-y-4">
                {scenarios.map((scenario, index) => (
                    <ScenarioCard
                        key={scenario.formId}
                        scenario={scenario}
                        index={index}
                        canRemove={scenarios.length > 1}
                        onUpdate={updateScenario}
                        onBlur={blurScenarioField}
                        onRemove={removeScenario}
                    />
                ))}
            </div>

            {/* Add scenario button (req 6.6: multiple simultaneous scenarios) */}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addScenario}
                aria-label="Add scenario"
            >
                + Add Scenario
            </Button>

            {/* Projected growth chart (req 6.5, 6.7) */}
            {validScenarios.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">
                        Projected Growth
                    </h3>

                    {/* Contributions-only notice (req 6.4) */}
                    {!hasSnapshots && (
                        <div
                            role="status"
                            aria-live="polite"
                            className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-400"
                        >
                            Simulation based on contributions only — no portfolio snapshots found.
                        </div>
                    )}

                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart
                            data={chartData}
                            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                            aria-label="Projected growth chart"
                        >
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="hsl(var(--border))"
                            />
                            <XAxis
                                dataKey="year"
                                label={{
                                    value: "Year",
                                    position: "insideBottomRight",
                                    offset: -5,
                                    style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                                }}
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            />
                            <YAxis
                                tickFormatter={formatRON}
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                label={{
                                    value: "RON",
                                    angle: -90,
                                    position: "insideLeft",
                                    offset: 10,
                                    style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                                }}
                                width={60}
                            />
                            <Tooltip
                                formatter={(value: number, name: string) => {
                                    const ron = new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 }).format(value);
                                    const eur = ronEur ? ` / ${new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value / ronEur)}` : "";
                                    return [`${ron}${eur}`, name];
                                }}
                                labelFormatter={(label) => `Year ${label}`}
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "6px",
                                    fontSize: "12px",
                                    color: "hsl(var(--foreground))",
                                }}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                            />
                            {validScenarios.map((scenario, idx) => (
                                <Line
                                    key={scenario.id}
                                    type="monotone"
                                    dataKey={scenario.label}
                                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                    connectNulls={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Summary table (req 6.8) */}
            {scenarioResults.length > 0 && (
                <ForecastSummaryTable
                    scenarioResults={scenarioResults}
                    colors={CHART_COLORS}
                    ronEur={ronEur}
                />
            )}
        </div>
    );
}

// ── ScenarioCard sub-component ────────────────────────────────────────────────

interface ScenarioCardProps {
    scenario: ScenarioFormState;
    index: number;
    canRemove: boolean;
    onUpdate: (
        formId: string,
        field: "monthlyContribution" | "annualGrowthRate" | "horizonYears" | "label",
        value: string
    ) => void;
    onBlur: (formId: string, field: keyof ScenarioErrors) => void;
    onRemove: (formId: string) => void;
}

function ScenarioCard({
    scenario,
    index,
    canRemove,
    onUpdate,
    onBlur,
    onRemove,
}: ScenarioCardProps) {
    const prefix = scenario.formId;

    const contribError =
        scenario.touched.monthlyContribution && scenario.errors.monthlyContribution;
    const rateError =
        scenario.touched.annualGrowthRate && scenario.errors.annualGrowthRate;
    const horizonError =
        scenario.touched.horizonYears && scenario.errors.horizonYears;

    return (
        <div
            className="rounded-lg border border-border bg-card p-5 space-y-4"
            aria-label={`${scenario.label} inputs`}
        >
            {/* Card header: label + remove button */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                        Scenario {index + 1}
                    </span>
                    <Input
                        id={`${prefix}-label`}
                        type="text"
                        value={scenario.label}
                        onChange={(e) => onUpdate(prefix, "label", e.target.value)}
                        placeholder={`Scenario ${index + 1}`}
                        className="h-7 px-2 text-sm max-w-[180px]"
                        aria-label="Scenario label"
                    />
                </div>
                {canRemove && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemove(prefix)}
                        aria-label={`Remove ${scenario.label}`}
                        className="text-destructive hover:text-destructive shrink-0"
                    >
                        Remove
                    </Button>
                )}
            </div>

            {/* Fields grid */}
            <div className="grid gap-4 sm:grid-cols-3">
                {/* Monthly contribution */}
                <div className="space-y-1">
                    <Label htmlFor={`${prefix}-contribution`}>
                        Monthly Contribution (RON)
                    </Label>
                    <Input
                        id={`${prefix}-contribution`}
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        max={1_000_000}
                        step="any"
                        placeholder="e.g. 500"
                        value={scenario.monthlyContribution}
                        onChange={(e) =>
                            onUpdate(prefix, "monthlyContribution", e.target.value)
                        }
                        onBlur={() => onBlur(prefix, "monthlyContribution")}
                        aria-describedby={
                            contribError ? `${prefix}-contribution-error` : undefined
                        }
                        aria-invalid={contribError ? true : undefined}
                        className={
                            contribError
                                ? "border-destructive focus-visible:ring-destructive"
                                : ""
                        }
                    />
                    {contribError && (
                        <p
                            id={`${prefix}-contribution-error`}
                            role="alert"
                            className="text-xs text-destructive"
                        >
                            {scenario.errors.monthlyContribution}
                        </p>
                    )}
                </div>

                {/* Annual growth rate */}
                <div className="space-y-1">
                    <Label htmlFor={`${prefix}-rate`}>Annual Growth Rate (%)</Label>
                    <Input
                        id={`${prefix}-rate`}
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        max={100}
                        step="any"
                        placeholder="e.g. 7"
                        value={scenario.annualGrowthRate}
                        onChange={(e) =>
                            onUpdate(prefix, "annualGrowthRate", e.target.value)
                        }
                        onBlur={() => onBlur(prefix, "annualGrowthRate")}
                        aria-describedby={
                            rateError ? `${prefix}-rate-error` : undefined
                        }
                        aria-invalid={rateError ? true : undefined}
                        className={
                            rateError
                                ? "border-destructive focus-visible:ring-destructive"
                                : ""
                        }
                    />
                    {rateError && (
                        <p
                            id={`${prefix}-rate-error`}
                            role="alert"
                            className="text-xs text-destructive"
                        >
                            {scenario.errors.annualGrowthRate}
                        </p>
                    )}
                </div>

                {/* Horizon */}
                <div className="space-y-1">
                    <Label htmlFor={`${prefix}-horizon`}>Horizon (years)</Label>
                    <Input
                        id={`${prefix}-horizon`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={30}
                        step={1}
                        placeholder="e.g. 10"
                        value={scenario.horizonYears}
                        onChange={(e) =>
                            onUpdate(prefix, "horizonYears", e.target.value)
                        }
                        onBlur={() => onBlur(prefix, "horizonYears")}
                        aria-describedby={
                            horizonError ? `${prefix}-horizon-error` : undefined
                        }
                        aria-invalid={horizonError ? true : undefined}
                        className={
                            horizonError
                                ? "border-destructive focus-visible:ring-destructive"
                                : ""
                        }
                    />
                    {horizonError && (
                        <p
                            id={`${prefix}-horizon-error`}
                            role="alert"
                            className="text-xs text-destructive"
                        >
                            {scenario.errors.horizonYears}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── ForecastSummaryTable sub-component ───────────────────────────────────────


interface ScenarioResultEntry {
    scenario: ScenarioInput;
    result: ScenarioResult;
}

interface ForecastSummaryTableProps {
    scenarioResults: ScenarioResultEntry[];
    colors: string[];
    ronEur: number | null;
}

/** RON formatter for table cells — always 2 decimal places */
function formatRONCell(value: number): string {
    return new Intl.NumberFormat("ro-RO", {
        style: "currency",
        currency: "RON",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function formatEURCell(value: number): string {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}

function ForecastSummaryTable({ scenarioResults, colors, ronEur }: ForecastSummaryTableProps) {
    // Span years from 1 to the maximum horizon across all scenarios
    const maxHorizon = Math.max(...scenarioResults.map((sr) => sr.scenario.horizonYears));
    const allYears = Array.from({ length: maxHorizon }, (_, i) => i + 1);

    return (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
                Projection Summary
            </h3>
            <div className="overflow-x-auto">
                <table
                    className="w-full text-xs border-collapse"
                    aria-label="Forecast summary table"
                >
                    <thead>
                        {/* Scenario header row — spans 3 columns per scenario */}
                        <tr>
                            <th
                                scope="col"
                                rowSpan={2}
                                className="border border-border px-3 py-2 text-left font-semibold text-muted-foreground bg-muted/40 whitespace-nowrap"
                            >
                                Year
                            </th>
                            {scenarioResults.map((sr, idx) => (
                                <th
                                    key={sr.scenario.id}
                                    scope="colgroup"
                                    colSpan={ronEur ? 6 : 3}
                                    className="border border-border px-3 py-2 text-center font-semibold whitespace-nowrap"
                                    style={{ color: colors[idx % colors.length] }}
                                >
                                    {sr.scenario.label}
                                </th>
                            ))}
                        </tr>
                                                {/* Sub-column headers */}
                        <tr>
                            {scenarioResults.map((sr) => (
                                <React.Fragment key={`sub-${sr.scenario.id}`}>
                                    <th scope="col" className="border border-border px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Projected (RON)</th>
                                    {ronEur && <th scope="col" className="border border-border px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Projected (EUR)</th>}
                                    <th scope="col" className="border border-border px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Contributions (RON)</th>
                                    {ronEur && <th scope="col" className="border border-border px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Contributions (EUR)</th>}
                                    <th scope="col" className="border border-border px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Est. Gain (RON)</th>
                                    {ronEur && <th scope="col" className="border border-border px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Est. Gain (EUR)</th>}
                                </React.Fragment>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {allYears.map((year) => (
                            <tr
                                key={year}
                                className="even:bg-muted/20 hover:bg-muted/40 transition-colors"
                            >
                                <td className="border border-border px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                                    {year}
                                </td>
                                {scenarioResults.map((sr) => {
                                    const mark = sr.result.yearMarks.find(
                                        (m) => m.year === year
                                    );
                                    if (!mark) {
                                        // Year is beyond this scenario's horizon — show dashes
                                            return (
                                                <React.Fragment key={`empty-${sr.scenario.id}-${year}`}>
                                                    <td className="border border-border px-3 py-2 text-right text-muted-foreground/50">—</td>
                                                    {ronEur && <td className="border border-border px-3 py-2 text-right text-muted-foreground/50">—</td>}
                                                    <td className="border border-border px-3 py-2 text-right text-muted-foreground/50">—</td>
                                                    {ronEur && <td className="border border-border px-3 py-2 text-right text-muted-foreground/50">—</td>}
                                                    <td className="border border-border px-3 py-2 text-right text-muted-foreground/50">—</td>
                                                    {ronEur && <td className="border border-border px-3 py-2 text-right text-muted-foreground/50">—</td>}
                                                </React.Fragment>
                                            );
                                    }
                                    return (
                                        <React.Fragment key={`${sr.scenario.id}-${year}`}>
                                            <td className="border border-border px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatRONCell(mark.projectedValue)}</td>
                                            {ronEur && <td className="border border-border px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatEURCell(mark.projectedValue / ronEur)}</td>}
                                            <td className="border border-border px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatRONCell(mark.totalContributions)}</td>
                                            {ronEur && <td className="border border-border px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatEURCell(mark.totalContributions / ronEur)}</td>}
                                            <td className={["border border-border px-3 py-2 text-right tabular-nums whitespace-nowrap", mark.estimatedGain > 0 ? "text-green-500" : mark.estimatedGain < 0 ? "text-red-500" : ""].filter(Boolean).join(" ")}>{formatRONCell(mark.estimatedGain)}</td>
                                            {ronEur && <td className={["border border-border px-3 py-2 text-right tabular-nums whitespace-nowrap", mark.estimatedGain > 0 ? "text-green-500" : mark.estimatedGain < 0 ? "text-red-500" : ""].filter(Boolean).join(" ")}>{formatEURCell(mark.estimatedGain / ronEur)}</td>}
                                        </React.Fragment>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
