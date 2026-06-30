"use client";

/**
 * Allocation tab — Portfolio spread visualisation (Requirements 4.2, 4.3, 4.4).
 *
 * Renders three interactive Recharts donut charts:
 *   1. Stocks vs ETFs  — type split by total current value (Req 4.2)
 *   2. Sector Exposure — value per sector across 8 taxonomy values (Req 4.3)
 *   3. Position Sizing — each asset's share of total portfolio value (Req 4.4)
 *
 * Also renders an Asset Positions list with warning/locked indicators (Req 4.5, 4.6).
 * Also renders an Add Asset form with field-level validation (Req 4.7, 4.8).
 *
 * When no assets exist the charts are hidden and a prompt is shown instead.
 */

import * as React from "react";
import { useRefresh } from "@/app/context/RefreshContext";
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import type { Asset } from "@prisma/client";
import {
    calculatePositionWeights,
    getPositionStatus,
    VALID_SECTORS,
} from "@/lib/assets";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Palette ─────────────────────────────────────────────────────────────────

/** A colour palette that reads well on a dark background. */
const PALETTE = [
    "#6366f1", // indigo-500
    "#22d3ee", // cyan-400
    "#f59e0b", // amber-400
    "#10b981", // emerald-500
    "#f43f5e", // rose-500
    "#a78bfa", // violet-400
    "#fb923c", // orange-400
    "#34d399", // green-400
];

// ─── Chart-data helpers ───────────────────────────────────────────────────────

interface ChartEntry {
    name: string;
    value: number;
}

/** Build [Stock, ETF] data from asset list. */
function buildTypeData(assets: Asset[]): ChartEntry[] {
    const stockValue = assets
        .filter((a) => a.type === "Stock")
        .reduce((s, a) => s + a.currentValue, 0);
    const etfValue = assets
        .filter((a) => a.type === "ETF")
        .reduce((s, a) => s + a.currentValue, 0);

    return [
        { name: "Stocks", value: stockValue },
        { name: "ETFs", value: etfValue },
    ].filter((e) => e.value > 0);
}

/** Build sector data across the 8 taxonomy sectors (Req 4.3). */
function buildSectorData(assets: Asset[]): ChartEntry[] {
    const sectorMap: Record<string, number> = Object.fromEntries(
        VALID_SECTORS.map((s) => [s, 0])
    );

    for (const asset of assets) {
        const sector = asset.sector in sectorMap ? asset.sector : "Other";
        sectorMap[sector] = (sectorMap[sector] ?? 0) + asset.currentValue;
    }

    return VALID_SECTORS.map((s) => ({ name: s, value: sectorMap[s] })).filter(
        (e) => e.value > 0
    );
}

/** Build per-asset position sizing data using calculatePositionWeights (Req 4.4). */
function buildPositionData(assets: Asset[]): ChartEntry[] {
    return calculatePositionWeights(assets)
        .filter((w) => w.weight > 0)
        .map((w) => ({ name: w.ticker, value: w.weight }));
}

// ─── Tooltip formatter ────────────────────────────────────────────────────────

/** Formats tooltip values; position chart shows %, others show raw value. */
function makeTooltipFormatter(isPercent: boolean) {
    // Recharts Tooltip `formatter` signature: (value, name, props) => string | [string, string]
    return (value: number): [string, string] => {
        const formatted = isPercent
            ? `${value.toFixed(2)}%`
            : `$${value.toFixed(2)}`;
        return [formatted, ""];
    };
}

// ─── Single reusable donut chart ──────────────────────────────────────────────

interface DonutChartProps {
    title: string;
    data: ChartEntry[];
    isPercent?: boolean;
}

function DonutChart({ title, data, isPercent = false }: DonutChartProps) {
    return (
        <div className="flex flex-col items-center gap-3">
            <h3 className="text-sm font-semibold text-foreground/80 text-center">
                {title}
            </h3>
            <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius="52%"
                        outerRadius="72%"
                        paddingAngle={2}
                        dataKey="value"
                        aria-label={title}
                    >
                        {data.map((_, idx) => (
                            <Cell
                                key={idx}
                                fill={PALETTE[idx % PALETTE.length]}
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        formatter={makeTooltipFormatter(isPercent)}
                        contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "0.375rem",
                            color: "hsl(var(--foreground))",
                            fontSize: "0.75rem",
                        }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "0.75rem" }}
                        formatter={(value) => (
                            <span className="text-foreground/70">{value}</span>
                        )}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Asset position list — sortable, no Status column ────────────────────────

// Columns: Ticker | Name | Sector | Current $ | Buying Price | Actual Price | P&L $ | P&L %
//
// - Current $     = Valoare — total current USD value of the position
// - Buying Price  = Pret deschidere — avg price per share paid (costBasis)
// - Actual Price  = Pret actual — current price per share (currentPrice)
// - P&L $         = Current $ − (volume × Buying Price) = stored as profitNet from OCR
//                   Approximated here as: currentValue − costBasis (total cost)
// - P&L %         = (Actual Price − Buying Price) / Buying Price × 100

type SortKey = "ticker" | "name" | "sector" | "currentValue" | "costBasis" | "currentPrice" | "pnl" | "pnlPct";
type SortDir = "asc" | "desc";

interface SortState { key: SortKey; dir: SortDir }

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return <span className="ml-1 opacity-30 text-[10px]">↕</span>;
    return <span className="ml-1 text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>;
}

function AssetPositionList({ assets, lastUpdated, freeFunds }: { assets: Asset[]; lastUpdated?: string; freeFunds?: number }) {
    const [sort, setSort] = React.useState<SortState>({ key: "pnl", dir: "asc" });

    function toggle(key: SortKey) {
        setSort(prev =>
            prev.key === key
                ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
                : { key, dir: "desc" }
        );
    }

    const rows = [...assets]
        .map(a => {
            const buyPrice = a.costBasis;   // Pret deschidere (per share)
            const actualPrice = (a as Asset & { currentPrice?: number }).currentPrice ?? 0;
            // P&L % from per-share prices: (actual - buy) / buy × 100
            const pnlPct = buyPrice > 0 && actualPrice > 0
                ? ((actualPrice - buyPrice) / buyPrice) * 100
                : 0;
            // P&L $ = currentValue × pnlPct / (100 + pnlPct)
            // This gives the absolute gain/loss portion of the current position value
            const pnl = (pnlPct !== 0 && (100 + pnlPct) !== 0)
                ? (a.currentValue * pnlPct) / (100 + pnlPct)
                : 0;
            const totalCost = a.currentValue - pnl;

            return { ...a, buyPrice, actualPrice, totalCost, pnl, pnlPct };
        })
        .sort((a, b) => {
            const k = sort.key;
            const av = (a as Record<string, unknown>)[k] as number | string;
            const bv = (b as Record<string, unknown>)[k] as number | string;
            const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
            return sort.dir === "asc" ? cmp : -cmp;
        });

    const totalCurrent = rows.reduce((s, r) => s + r.currentValue, 0);
    const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
    const totalPnl = totalCurrent - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const totalColor = totalPnl > 0 ? "text-green-400" : totalPnl < 0 ? "text-red-400" : "text-muted-foreground";

    function Th({ label, k, align = "right" }: { label: string; k: SortKey; align?: "left" | "right" }) {
        const active = sort.key === k;
        return (
            <th
                scope="col"
                className={`px-4 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors text-${align}`}
                onClick={() => toggle(k)}
            >
                {label}<SortIcon active={active} dir={sort.dir} />
            </th>
        );
    }

    return (
        <section aria-label="Asset positions" className="mt-6">
            <div className="flex items-baseline gap-3 mb-4">
                <h2 className="text-lg font-semibold text-foreground">Asset Positions</h2>
                {lastUpdated && (
                    <span className="text-xs text-muted-foreground">
                        last updated {new Date(lastUpdated).toLocaleDateString("ro-RO", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                        })}
                    </span>
                )}
            </div>
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/40">
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground w-8">#</th>
                            <Th label="Ticker" k="ticker" align="left" />
                            <Th label="Name" k="name" align="left" />
                            <Th label="Sector" k="sector" align="left" />
                            <Th label="Current $" k="currentValue" />
                            <Th label="Buying Stock Price" k="costBasis" />
                            <Th label="Actual Stock Price" k="currentPrice" />
                            <Th label="P&L $" k="pnl" />
                            <Th label="P&L %" k="pnlPct" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => {
                            const pnlColor = row.pnl > 0 ? "text-green-400" : row.pnl < 0 ? "text-red-400" : "text-muted-foreground";
                            const sign = row.pnl > 0 ? "+" : "";
                            return (
                                <tr key={row.ticker} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                    <td className="px-3 py-3 text-right text-xs text-muted-foreground">{i + 1}</td>
                                    <td className="px-4 py-3 font-mono font-semibold text-foreground">{row.ticker}</td>
                                    <td className="px-4 py-3 text-foreground/70 text-xs">{row.name || "—"}</td>
                                    <td className="px-4 py-3 text-foreground/80">{row.sector}</td>
                                    <td className="px-4 py-3 text-right font-mono text-foreground">${row.currentValue.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-foreground/60">${row.buyPrice.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-foreground/80">
                                        {row.actualPrice > 0 ? `$${row.actualPrice.toFixed(2)}` : "—"}
                                    </td>
                                    <td className={`px-4 py-3 text-right font-mono font-semibold ${pnlColor}`}>
                                        {sign}{row.pnl.toFixed(2)}
                                    </td>
                                    <td className={`px-4 py-3 text-right font-mono ${pnlColor}`}>
                                        {sign}{row.pnlPct.toFixed(2)}%
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                            <td className="px-3 py-3" />
                            <td className="px-4 py-3 text-foreground" colSpan={3}>Total</td>
                            <td className="px-4 py-3 text-right font-mono text-foreground">${totalCurrent.toFixed(2)}</td>
                            <td colSpan={2} />
                            <td className={`px-4 py-3 text-right font-mono font-semibold ${totalColor}`}>
                                {totalPnl > 0 ? "+" : ""}{totalPnl.toFixed(2)}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono ${totalColor}`}>
                                {totalPnl > 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
                            </td>
                        </tr>
                        {freeFunds !== undefined && freeFunds > 0 && (
                            <>
                                <tr className="border-t border-border bg-muted/10 text-muted-foreground">
                                    <td className="px-3 py-2" />
                                    <td className="px-4 py-2 text-sm" colSpan={3}>Free cash (USD)</td>
                                    <td className="px-4 py-2 text-right font-mono text-sm">${freeFunds.toFixed(2)}</td>
                                    <td colSpan={4} />
                                </tr>
                                <tr className="border-t border-border bg-muted/20 font-semibold">
                                    <td className="px-3 py-2" />
                                    <td className="px-4 py-2 text-foreground text-sm" colSpan={3}>Total incl. cash</td>
                                    <td className="px-4 py-2 text-right font-mono text-sm text-foreground">${(totalCurrent + freeFunds).toFixed(2)}</td>
                                    <td colSpan={4} />
                                </tr>
                            </>
                        )}
                    </tfoot>
                </table>
            </div>
        </section>
    );
}

// ─── AI Tips ──────────────────────────────────────────────────────────────────

interface Tip {
    type: "buy" | "watch" | "sell";
    ticker: string;
    reason: string;
}

function AiTips() {
    const [tips, setTips] = React.useState<Tip[] | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [generatedAt, setGeneratedAt] = React.useState<string | null>(null);

    async function fetchTips() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/ai-tips");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
            setTips(data.tips);
            setGeneratedAt(data.generatedAt);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to get tips");
        } finally {
            setLoading(false);
        }
    }

    const typeStyle: Record<string, string> = {
        buy: "border-green-500/40 bg-green-500/10 text-green-400",
        watch: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
        sell: "border-red-500/40 bg-red-500/10 text-red-400",
    };
    const typeLabel: Record<string, string> = {
        buy: "💚 Consider buying more",
        watch: "👁 Watch closely",
        sell: "🔴 Consider selling",
    };

    return (
        <section className="mt-10">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">AI Portfolio Tips</h2>
                <button
                    type="button"
                    onClick={fetchTips}
                    disabled={loading}
                    className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 disabled:opacity-50 transition-colors"
                >
                    {loading ? "Generating…" : tips ? "Refresh tips" : "Generate tips"}
                </button>
            </div>

            {error && (
                <p role="alert" className="text-sm text-destructive mb-3">{error}</p>
            )}

            {!tips && !loading && !error && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Click &quot;Generate tips&quot; to get AI-powered suggestions based on your current positions and recent news.
                </div>
            )}

            {loading && (
                <div className="space-y-3">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
                            <div className="h-4 w-24 bg-muted rounded mb-2" />
                            <div className="h-3 w-full bg-muted rounded" />
                        </div>
                    ))}
                </div>
            )}

            {tips && (
                <>
                    <div className="space-y-3">
                        {tips.map((tip, i) => (
                            <div key={i} className={`rounded-lg border p-4 ${typeStyle[tip.type] ?? ""}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold">{typeLabel[tip.type] ?? tip.type}</span>
                                    <span className="font-mono font-bold text-sm">{tip.ticker}</span>
                                </div>
                                <p className="text-sm opacity-90">{tip.reason}</p>
                            </div>
                        ))}
                    </div>
                    {generatedAt && (
                        <p className="text-xs text-muted-foreground mt-2">
                            Generated {new Date(generatedAt).toLocaleTimeString()}
                        </p>
                    )}
                </>
            )}
        </section>
    );
}

// ─── Allocation panel ─────────────────────────────────────────────────────────

export function Allocation() {
    const { refreshCount } = useRefresh();
    const [assets, setAssets] = React.useState<Asset[] | null>(null);
    const [lastUpdated, setLastUpdated] = React.useState<string | undefined>();
    const [error, setError] = React.useState<string | null>(null);
    const [freeFunds, setFreeFunds] = React.useState<number | undefined>();

    // Date navigation — available snapshot dates + selected index
    const [availableDates, setAvailableDates] = React.useState<string[]>([]);
    const [dateIdx, setDateIdx] = React.useState<number | null>(null); // null = current (live)

    // Reload available snapshot dates on mount AND after every daily save
    React.useEffect(() => {
        fetch("/api/asset-snapshots")
            .then(r => r.json())
            .then((snaps: { date: string }[]) => {
                const dates = Array.from(new Set(snaps.map(s => s.date))).sort();
                setAvailableDates(dates);
            })
            .catch(() => { });
        // Always jump back to live view so user sees today's fresh data
        setDateIdx(null);
    }, [refreshCount]);

    const selectedDate = dateIdx !== null ? availableDates[dateIdx] : null;
    const isCurrentView = dateIdx === null;

    // Fetch free funds from daily entry for the selected date (or latest)
    React.useEffect(() => {
        fetch("/api/daily-entry")
            .then(r => r.json())
            .then((entries: { date: string; usdFreeFunds: number }[]) => {
                if (!entries.length) return;
                const match = selectedDate
                    ? entries.find(e => e.date === selectedDate)
                    : entries[0];
                setFreeFunds(match?.usdFreeFunds);
            })
            .catch(() => { });
    }, [selectedDate, refreshCount]);

    const loadAssets = React.useCallback(() => {
        setAssets(null);
        setError(null);

        const url = selectedDate
            ? `/api/asset-snapshots/${selectedDate}`
            : "/api/assets";

        fetch(url)
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json() as Promise<Asset[]>;
            })
            .then((data) => {
                setAssets(data);
                if (!selectedDate) {
                    // Use the most recent snapshot date as "last updated" — reflects
                    // when data was last ingested, not when the Asset row was touched.
                    const mostRecentSnapshotDate = availableDates.length > 0
                        ? availableDates[availableDates.length - 1]
                        : null;
                    if (mostRecentSnapshotDate) setLastUpdated(mostRecentSnapshotDate);
                } else {
                    setLastUpdated(selectedDate);
                }
            })
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Failed to load assets");
            });
    }, [selectedDate, refreshCount]);

    React.useEffect(() => {
        loadAssets();
    }, [loadAssets]);

    // Loading state
    if (assets === null && !error) {
        return (
            <div data-testid="allocation-loading">
                <div className="mt-6 space-y-3">
                    <Skeleton className="h-6 w-64" />
                    <div className="rounded-lg border border-border overflow-hidden">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex gap-4 px-4 py-3 border-b border-border last:border-0">
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-4 w-32 flex-1" />
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-4 w-20" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[20vh]">
                <p className="text-destructive text-sm">Error loading assets: {error}</p>
            </div>
        );
    }

    // Empty state
    if (assets !== null && assets.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[20vh]">
                <p className="text-muted-foreground text-sm">
                    No assets yet. Upload an XTB screenshot in the Daily Log tab to populate positions.
                </p>
            </div>
        );
    }

    return (
        <section aria-label="Portfolio positions">
            {/* Date navigator */}
            {availableDates.length > 0 && (
                <div className="flex items-center gap-3 mb-2">
                    <button
                        type="button"
                        onClick={() => {
                            if (dateIdx === null) setDateIdx(availableDates.length - 1);
                            else if (dateIdx > 0) setDateIdx(dateIdx - 1);
                        }}
                        disabled={dateIdx === 0}
                        className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        aria-label="Previous day"
                    >
                        ◀
                    </button>
                    <span className="text-sm font-medium text-foreground min-w-[90px] text-center">
                        {isCurrentView ? "Today (live)" : selectedDate}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            if (dateIdx === null) return;
                            if (dateIdx < availableDates.length - 1) setDateIdx(dateIdx + 1);
                            else setDateIdx(null); // back to live
                        }}
                        disabled={isCurrentView}
                        className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        aria-label="Next day"
                    >
                        ▶
                    </button>
                    {!isCurrentView && (
                        <button
                            type="button"
                            onClick={() => setDateIdx(null)}
                            className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                        >
                            Back to live
                        </button>
                    )}
                    {!isCurrentView && (
                        <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-0.5">
                            Historical view — {selectedDate}
                        </span>
                    )}
                </div>
            )}
            <AssetPositionList assets={assets!} lastUpdated={lastUpdated} freeFunds={freeFunds} />
            {isCurrentView && <AiTips />}
        </section>
    );
}
