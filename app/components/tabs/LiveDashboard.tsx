"use client";

import * as React from "react";
import { toRON, type ExchangeRates } from "@/lib/fx";
import { Skeleton } from "@/components/ui/skeleton";
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Brush,
} from "recharts";
import { useRefresh } from "@/app/context/RefreshContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RatesResponse {
    rates?: { RON_USD: number; RON_EUR: number; fetchedAt: string };
    fromCache?: boolean;
    cacheAgeMinutes?: number;
    error?: string;
}

interface Snapshot {
    id: string;
    date: string;
    usdTotalValue: number;
    usdFreeFunds: number;
    usdNetProfitLoss: number;
    usdRealizedPnl: number;
    totalDepositedRON: number;
    freeRON: number;
    etfValueEUR: number;
    etfDepositedEUR: number;
}

interface Asset {
    ticker: string;
    name: string;
    currentValue: number;
    costBasis: number;
    sector: string;
    currency: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCacheAge(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return h === 0 ? `${m}m ago` : `${h}h ${m}m ago`;
}

function fmtRON(n: number) {
    return n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Palette ───────────────────────────────────────────────────────────────────

const PALETTE = [
    "#6366f1", "#22d3ee", "#10b981", "#f59e0b",
    "#f43f5e", "#a78bfa", "#fb923c", "#34d399",
    "#60a5fa", "#e879f9",
];

// ── Donut chart ───────────────────────────────────────────────────────────────

interface SliceEntry {
    name: string;
    value: number;       // always RON
    color?: string;
    subtitle?: string;   // original currency display e.g. "$395.33" or "€400.55"
}

interface DonutProps {
    data: SliceEntry[];
    title: string;
    valueFormatter?: (v: number) => string;
}

function DonutChart({ data, title, valueFormatter }: DonutProps) {
    const filtered = data.filter((d) => d.value > 0);
    if (filtered.length === 0) return null;
    const fmt = valueFormatter ?? ((v) => `${fmtRON(v)} RON`);
    return (
        <div className="flex flex-col items-center gap-1">
            <h3 className="text-sm font-semibold text-foreground/80 text-center">{title}</h3>
            <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Pie
                        data={filtered}
                        cx="50%"
                        cy="50%"
                        innerRadius="50%"
                        outerRadius="74%"
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) =>
                            percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""
                        }
                        labelLine={false}
                    >
                        {filtered.map((d, i) => (
                            <Cell key={i} fill={d.color ?? PALETTE[i % PALETTE.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        formatter={(v: number, name: string) => {
                            const entry = filtered.find(d => d.name === name);
                            const ronStr = fmt(v);
                            const extra = entry?.subtitle ? ` (${entry.subtitle})` : "";
                            return [`${ronStr}${extra}`, name];
                        }}
                        contentStyle={{
                            backgroundColor: "#1e293b",
                            borderColor: "#334155",
                            borderRadius: "0.375rem",
                            color: "#f1f5f9",
                            fontSize: "0.75rem",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        }}
                        itemStyle={{ color: "#f1f5f9" }}
                        labelStyle={{ color: "#94a3b8", marginBottom: "2px" }}
                    />
                    <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "0.75rem" }}
                        formatter={(v) => <span className="text-foreground/70">{v}</span>}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}

// ── Return modal (rendered outside the draggable grid, same pattern as StockModal in Performance) ──

const TOOLTIP_STYLE = { backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "0.375rem", color: "#f1f5f9", fontSize: "0.75rem", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" };

interface ReturnModalProps {
    chartData: { date: string; "Total %": number; "Stocks %": number; "ETF %": number }[];
    onClose: () => void;
}

function ReturnModal({ chartData, onClose }: ReturnModalProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-card border border-border rounded-xl w-full max-w-5xl p-6 space-y-4 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-foreground">Cumulative Return (%)</h3>
                        <p className="text-xs text-muted-foreground">vs initial investment — 0% = breakeven</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none px-2" aria-label="Close">×</button>
                </div>
                <ResponsiveContainer width="100%" height={440}>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                        <Tooltip formatter={(v: number, n: string) => [`${v > 0 ? "+" : ""}${v.toFixed(2)}%`, n]} contentStyle={TOOLTIP_STYLE} />
                        <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                        <Brush dataKey="date" height={22} stroke="#6366f1" fill="#1e293b" travellerWidth={6} />
                        <Line type="monotone" dataKey="Total %" stroke="#ffffff" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="Stocks %" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="ETF %" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground text-center">Drag scrollbar to navigate · Click outside to close</p>
            </div>
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LiveDashboard() {
    const { refreshCount } = useRefresh();
    const [ratesData, setRatesData] = React.useState<RatesResponse | null>(null);
    const [latest, setLatest] = React.useState<Snapshot | null>(null);
    const [allEntries, setAllEntries] = React.useState<Snapshot[]>([]);
    const [assets, setAssets] = React.useState<Asset[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [returnExpanded, setReturnExpanded] = React.useState(false);
    const [panelOrder, setPanelOrder] = React.useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem("liveDashboardOrder") ?? "[]"); } catch { return []; }
    });
    const dragId = React.useRef<string | null>(null);

    React.useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const [ratesRes, entriesRes, assetsRes] = await Promise.all([
                    fetch("/api/rates"),
                    fetch("/api/daily-entry"),
                    fetch("/api/assets"),
                ]);

                setRatesData(await ratesRes.json());

                if (entriesRes.ok) {
                    const entries: Snapshot[] = await entriesRes.json();
                    setLatest(entries.length > 0 ? entries[0] : null);
                    // Store all entries in chronological order for the chart
                    setAllEntries([...entries].reverse());
                }
                if (assetsRes.ok) setAssets(await assetsRes.json());
            } catch {
                setRatesData({ error: "Failed to load data" });
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [refreshCount]); // re-fetch whenever a daily entry save triggers a refresh

    // ── Loading skeleton ──────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="space-y-6" data-testid="live-dashboard-loading">
                <Skeleton className="h-8 w-48 rounded-md" />
                <div className="rounded-lg border border-border bg-card p-6 shadow-sm space-y-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-64" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                    {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[320px] rounded-lg" />)}
                </div>
            </div>
        );
    }

    // ── Derived values ────────────────────────────────────────────────────────

    const hasValidRates =
        ratesData?.rates?.RON_USD !== undefined &&
        ratesData?.rates?.RON_EUR !== undefined;

    let rates: ExchangeRates | null = null;
    if (hasValidRates) {
        rates = {
            RON_USD: ratesData!.rates!.RON_USD,
            RON_EUR: ratesData!.rates!.RON_EUR,
            fetchedAt: new Date(ratesData!.rates!.fetchedAt),
        };
    }

    // USD account total → RON
    const usdTotal = latest?.usdTotalValue ?? 0;
    const stocksRON = rates && usdTotal > 0 ? toRON(usdTotal, "USD", rates) : null;

    // ETF → RON
    const etfEUR = latest?.etfValueEUR ?? 0;
    const etfRON = rates && etfEUR > 0 ? toRON(etfEUR, "EUR", rates) : null;

    const deposited = latest?.totalDepositedRON ?? 0;
    const freeRON = latest?.freeRON ?? 0;

    // Total net wealth = stocks (USD→RON) + ETF (EUR→RON) + free RON
    const totalRON = stocksRON !== null
        ? stocksRON + (etfRON ?? 0) + freeRON
        : null;

    // Gain vs deposited
    const gainRON = totalRON !== null && deposited > 0 ? totalRON - deposited : null;
    const gainPct = gainRON !== null && deposited > 0 ? (gainRON / deposited) * 100 : null;

    // ── Donut data ────────────────────────────────────────────────────────────

    // 1. Allocation: Stocks / ETF / Free RON
    const allocationData: SliceEntry[] = [
        { name: "Stocks (USD)", value: stocksRON ?? 0, color: "#6366f1", subtitle: `$${usdTotal.toFixed(2)}` },
        { name: "ETF (EUR)", value: etfRON ?? 0, color: "#22d3ee", subtitle: `€${etfEUR.toFixed(2)}` },
        { name: "Free RON", value: freeRON, color: "#10b981" },
    ];

    // 2. Sector exposure (by current value, USD only — stocks)
    const sectorMap: Record<string, number> = {};
    for (const a of assets) {
        sectorMap[a.sector] = (sectorMap[a.sector] ?? 0) + a.currentValue;
    }
    const sectorData: SliceEntry[] = Object.entries(sectorMap)
        .map(([name, value], i) => ({ name, value, color: PALETTE[i % PALETTE.length] }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value);

    // 3. Position sizing (individual stocks by current value)
    const positionData: SliceEntry[] = assets
        .filter(a => a.currentValue > 0)
        .sort((a, b) => b.currentValue - a.currentValue)
        .map((a, i) => ({ name: a.ticker, value: a.currentValue, color: PALETTE[i % PALETTE.length] }));

    // 4. Cumulative return chart data (computed here so panel card + modal share the same data)
    const returnChartData = (allEntries.length >= 1 && rates) ? allEntries.map(e => {
        const usdCost = e.usdTotalValue - (e.usdNetProfitLoss + (e.usdRealizedPnl ?? 0));
        const stocksPct = usdCost > 0 ? ((e.usdTotalValue - usdCost) / usdCost) * 100 : 0;
        const etfDeposited = e.etfDepositedEUR || 0;
        const etfPct = etfDeposited > 0 ? ((e.etfValueEUR - etfDeposited) / etfDeposited) * 100 : 0;
        const sRON = toRON(e.usdTotalValue, "USD", rates!);
        const eRON = toRON(e.etfValueEUR, "EUR", rates!);
        const totalNow = sRON + eRON + e.freeRON;
        const totalPct = e.totalDepositedRON > 0 ? ((totalNow - e.totalDepositedRON) / e.totalDepositedRON) * 100 : 0;
        return {
            date: e.date,
            "Total %": Math.round(totalPct * 100) / 100,
            "Stocks %": Math.round(stocksPct * 100) / 100,
            "ETF %": Math.round(etfPct * 100) / 100,
        };
    }) : [];

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Live Dashboard</h2>

            {/* Cache warning */}
            {hasValidRates && ratesData?.fromCache && ratesData.cacheAgeMinutes !== undefined && (
                <div role="status" aria-live="polite"
                    className="flex items-center gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400">
                    <span>⚠</span>
                    <span>Rates from cache — last updated {formatCacheAge(ratesData.cacheAgeMinutes)}</span>
                </div>
            )}
            {!hasValidRates && (
                <div role="alert"
                    className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    <span>✕</span>
                    <span>Live rates unavailable — net wealth cannot be calculated.</span>
                </div>
            )}

            {/* ── Net Wealth card ── */}
            {totalRON !== null ? (
                <div className="rounded-lg border border-border bg-card p-6 shadow-sm space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Total Net Wealth</p>
                    <p className="text-4xl font-bold tracking-tight text-foreground">
                        {fmtRON(totalRON)}{" "}
                        <span className="text-2xl font-semibold text-muted-foreground">RON</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Stocks: {fmtRON(stocksRON!)} RON
                        {etfRON !== null ? ` · ETF: ${fmtRON(etfRON)} RON` : ""}
                        {freeRON > 0 ? ` · Free RON: ${fmtRON(freeRON)}` : ""}
                        {latest ? ` · ${latest.date}` : ""}
                    </p>
                    {gainRON !== null && gainPct !== null && (
                        <p className={`text-sm font-semibold ${gainRON >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {gainRON >= 0 ? "+" : ""}{fmtRON(gainRON)} RON
                            ({gainRON >= 0 ? "+" : ""}{gainPct.toFixed(2)}%) vs {fmtRON(deposited)} RON deposited
                        </p>
                    )}

                    {/* P&L breakdown in original currencies */}
                    {latest && (
                        <div className="pt-2 mt-2 border-t border-border/50 grid grid-cols-2 gap-3">
                            {/* USD P&L */}
                            <div>
                                <p className="text-xs text-muted-foreground mb-0.5">USD Account P&L</p>
                                {(() => {
                                    const openPnl = latest.usdNetProfitLoss;
                                    const realizedPnl = latest.usdRealizedPnl ?? 0;
                                    const totalPnlUSD = openPnl + realizedPnl;
                                    const costUSD = usdTotal - openPnl; // cost = total - open P&L
                                    const pnlPctUSD = costUSD > 0 ? (totalPnlUSD / costUSD * 100) : null;
                                    const color = totalPnlUSD >= 0 ? "text-green-400" : "text-red-400";
                                    const sign = totalPnlUSD >= 0 ? "+" : "";
                                    return (
                                        <>
                                            <p className={`text-sm font-semibold ${color}`}>
                                                {sign}{totalPnlUSD.toFixed(2)} USD
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                on ${usdTotal.toFixed(2)} total
                                                {pnlPctUSD !== null ? ` (${sign}${pnlPctUSD.toFixed(2)}%)` : ""}
                                            </p>
                                            {realizedPnl !== 0 && (
                                                <p className="text-xs text-muted-foreground/60">
                                                    open: {sign}{openPnl.toFixed(2)} + realized: +{realizedPnl.toFixed(2)}
                                                </p>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                            {/* EUR P&L */}
                            {etfEUR > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">ETF P&L (EUR)</p>
                                    {(() => {
                                        const deposited = latest.etfDepositedEUR || 0;
                                        const pnlEUR = deposited > 0 ? etfEUR - deposited : null;
                                        const pnlPct = pnlEUR !== null && deposited > 0 ? (pnlEUR / deposited * 100) : null;
                                        return pnlEUR !== null ? (
                                            <>
                                                <p className={`text-sm font-semibold ${pnlEUR >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                    {pnlEUR >= 0 ? "+" : ""}{pnlEUR.toFixed(2)} EUR
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    on €{deposited.toFixed(2)} deposited
                                                    {pnlPct !== null ? ` (${pnlEUR >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)` : ""}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">Add EUR deposited in Daily Log</p>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : hasValidRates ? (
                <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                    No snapshot yet. Upload your XTB screenshot in the Daily Log tab.
                </div>
            ) : null}

            {/* ── Return modal — rendered here at top level, outside the draggable grid ── */}
            {returnExpanded && returnChartData.length > 0 && (
                <ReturnModal chartData={returnChartData} onClose={() => setReturnExpanded(false)} />
            )}

            {/* ── Charts grid — draggable, order saved in localStorage ── */}
            {stocksRON !== null && (() => {
                // Build chart panels
                const panels: { id: string; node: React.ReactNode }[] = [];

                panels.push({
                    id: "allocation",
                    node: (
                        <div className="rounded-lg border border-border bg-card p-5 h-full">
                            <DonutChart title="Portfolio Allocation (RON)" data={allocationData} />
                        </div>
                    ),
                });

                if (sectorData.length > 0) {
                    panels.push({
                        id: "sector",
                        node: (
                            <div className="rounded-lg border border-border bg-card p-5 h-full">
                                <DonutChart title="Sector Exposure (USD)" data={sectorData} valueFormatter={v => `$${v.toFixed(2)}`} />
                            </div>
                        ),
                    });
                }

                if (positionData.length > 0) {
                    panels.push({
                        id: "position",
                        node: (
                            <div className="rounded-lg border border-border bg-card p-5 h-full">
                                <DonutChart title="Position Sizing (USD)" data={positionData} valueFormatter={v => `$${v.toFixed(2)}`} />
                            </div>
                        ),
                    });
                }

                // Cumulative return chart panel — expand button only, modal is rendered above
                if (returnChartData.length >= 1) {
                    const TS = TOOLTIP_STYLE;
                    panels.push({
                        id: "return",
                        node: (
                            <div className="rounded-lg border border-border bg-card p-5 h-full">
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-sm font-semibold text-foreground/80">Cumulative Return (%)</h3>
                                    <button type="button" onClick={() => setReturnExpanded(true)}
                                        className="text-muted-foreground hover:text-primary transition-colors text-base px-1 py-0.5 rounded border border-border hover:border-primary"
                                        title="Expand">⤢</button>
                                </div>
                                <p className="text-xs text-muted-foreground text-center mb-2">Each day vs initial investment. 0% = breakeven.</p>
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={returnChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                                        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                                        <Tooltip formatter={(v: number, n: string) => [`${v > 0 ? "+" : ""}${v.toFixed(2)}%`, n]} contentStyle={TS} />
                                        <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                                        <Line type="monotone" dataKey="Total %" stroke="#ffffff" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                        <Line type="monotone" dataKey="Stocks %" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                        <Line type="monotone" dataKey="ETF %" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ),
                    });
                }

                // Reorder panels using panelOrder state (persisted to localStorage)
                const allIds = panels.map(p => p.id);
                const orderedIds = [
                    ...panelOrder.filter(id => allIds.includes(id)),
                    ...allIds.filter(id => !panelOrder.includes(id)),
                ];
                const orderedPanels = orderedIds.map(id => panels.find(p => p.id === id)!).filter(Boolean);

                function onDragStart(id: string) { dragId.current = id; }
                function onDragOver(e: React.DragEvent) { e.preventDefault(); }
                function onDrop(targetId: string) {
                    if (!dragId.current || dragId.current === targetId) return;
                    const next = [...orderedIds];
                    const fi = next.indexOf(dragId.current);
                    const ti = next.indexOf(targetId);
                    next.splice(fi, 1);
                    next.splice(ti, 0, dragId.current);
                    dragId.current = null;
                    try { localStorage.setItem("liveDashboardOrder", JSON.stringify(next)); } catch { }
                    setPanelOrder(next);
                }

                return (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        {orderedPanels.map(panel => (
                            <div
                                key={panel.id}
                                draggable
                                onDragStart={() => onDragStart(panel.id)}
                                onDragOver={onDragOver}
                                onDrop={() => onDrop(panel.id)}
                                className="cursor-grab active:cursor-grabbing"
                            >
                                {panel.node}
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* ── Snapshot breakdown ── */}
            {latest && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-card p-4">
                        <p className="text-xs text-muted-foreground mb-1">Total USD Balance (XTB)</p>
                        <p className="text-xl font-bold text-foreground">
                            {latest.usdTotalValue.toFixed(2)} USD
                        </p>
                        {stocksRON !== null && (
                            <p className="text-xs text-muted-foreground mt-1">≈ {fmtRON(stocksRON)} RON</p>
                        )}
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4">
                        <p className="text-xs text-muted-foreground mb-1">Free Funds in XTB (USD)</p>
                        <p className="text-xl font-bold text-foreground">
                            {latest.usdFreeFunds.toFixed(2)} USD
                        </p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4">
                        <p className="text-xs text-muted-foreground mb-1">Profit/Loss (USD)</p>
                        <p className={`text-xl font-bold ${latest.usdNetProfitLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {latest.usdNetProfitLoss >= 0 ? "+" : ""}{latest.usdNetProfitLoss.toFixed(2)} USD
                        </p>
                    </div>
                </div>
            )}

            {/* ── FX rates ── */}
            {hasValidRates && rates && (
                <div className="flex flex-wrap gap-4">
                    <div className="rounded-md border border-border bg-secondary/30 px-4 py-3 text-sm">
                        <span className="text-muted-foreground mr-2">RON / USD</span>
                        <span className="font-semibold text-foreground">{rates.RON_USD.toFixed(4)}</span>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/30 px-4 py-3 text-sm">
                        <span className="text-muted-foreground mr-2">RON / EUR</span>
                        <span className="font-semibold text-foreground">{rates.RON_EUR.toFixed(4)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
