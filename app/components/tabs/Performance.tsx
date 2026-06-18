"use client";

import * as React from "react";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer, Brush,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { toRON, type ExchangeRates } from "@/lib/fx";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyEntry {
    date: string;
    usdTotalValue: number;
    etfValueEUR: number;
    freeRON: number;
    totalDepositedRON: number;
}

interface AssetSnapshot {
    date: string;
    ticker: string;
    currentValue: number;
    currentPrice: number;
    avgBuyPrice: number;
}

interface RatesResponse {
    rates?: { RON_USD: number; RON_EUR: number; fetchedAt: string };
}

type SnapshotWithPnl = AssetSnapshot & { pnlDollar: number };

// ── Palette ───────────────────────────────────────────────────────────────────

const COLORS = [
    "#6366f1", "#22d3ee", "#10b981", "#f59e0b",
    "#f43f5e", "#a78bfa", "#fb923c", "#34d399", "#60a5fa", "#e879f9",
];

const TOOLTIP_STYLE = {
    backgroundColor: "#1e293b",
    borderColor: "#334155",
    borderRadius: "0.375rem",
    color: "#f1f5f9",
    fontSize: "0.75rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
};

function fmtRON(v: number) {
    return `${v.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} RON`;
}

// ── Expanded stock modal ──────────────────────────────────────────────────────

interface StockModalProps {
    ticker: string;
    data: SnapshotWithPnl[];
    color: string;
    onClose: () => void;
}

function StockModal({ ticker, data, color, onClose }: StockModalProps) {
    const latest = data[data.length - 1];
    const pnlPct = latest.avgBuyPrice > 0
        ? ((latest.currentPrice - latest.avgBuyPrice) / latest.avgBuyPrice * 100)
        : 0;
    const pnlColor = pnlPct >= 0 ? "#10b981" : "#f43f5e";
    const startIndex = Math.max(0, data.length - 14);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-card border border-border rounded-xl w-full max-w-4xl p-6 space-y-4 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-xl text-foreground">{ticker}</span>
                        <span style={{ color: pnlColor }} className="text-sm font-semibold">
                            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground text-2xl leading-none px-2"
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                    {[
                        { label: "Avg buy price", value: `$${latest.avgBuyPrice.toFixed(2)}` },
                        { label: "Actual price", value: `$${latest.currentPrice.toFixed(2)}` },
                        { label: "Total value", value: `$${latest.currentValue.toFixed(2)}` },
                    ].map(({ label, value }) => (
                        <div key={label} className="rounded border border-border bg-muted/20 p-2">
                            <p className="text-muted-foreground">{label}</p>
                            <p className="font-mono font-semibold">{value}</p>
                        </div>
                    ))}
                </div>

                {/* Full chart with Brush scrolling */}
                <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={data} margin={{ top: 10, right: 50, left: 0, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis yAxisId="price" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${v}`} />
                        <YAxis yAxisId="pnl" orientation="right" tick={{ fontSize: 11, fill: pnlColor }} />
                        <Tooltip
                            formatter={(v: number, name: string) => [`$${(v as number).toFixed(2)}`, name]}
                            contentStyle={TOOLTIP_STYLE}
                        />
                        <Legend wrapperStyle={{ fontSize: "0.75rem", paddingBottom: "8px" }} />
                        <Brush
                            dataKey="date"
                            height={24}
                            stroke={color}
                            fill="#1e293b"
                            travellerWidth={8}
                            startIndex={startIndex}
                        />
                        <Line yAxisId="price" type="monotone" dataKey="currentPrice" name="Actual price" stroke={color} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line yAxisId="price" type="monotone" dataKey="avgBuyPrice" name="Avg buy price" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                        <Line yAxisId="price" type="monotone" dataKey="currentValue" name="Total value $" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line yAxisId="pnl" type="monotone" dataKey="pnlDollar" name="P&L $" stroke={pnlColor} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground text-center">
                    Drag the scrollbar below the chart to navigate dates. Click outside to close.
                </p>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Performance() {
    const [entries, setEntries] = React.useState<DailyEntry[]>([]);
    const [snapshots, setSnapshots] = React.useState<AssetSnapshot[]>([]);
    const [rates, setRates] = React.useState<ExchangeRates | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [expandedTicker, setExpandedTicker] = React.useState<string | null>(null);
    const [tickerOrder, setTickerOrder] = React.useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem("stockHistoryOrder") ?? "[]"); }
        catch { return []; }
    });
    const dragTicker = React.useRef<string | null>(null);

    React.useEffect(() => {
        async function load() {
            try {
                const [entriesRes, snapshotsRes, ratesRes] = await Promise.all([
                    fetch("/api/daily-entry"),
                    fetch("/api/asset-snapshots"),
                    fetch("/api/rates"),
                ]);
                if (!entriesRes.ok) throw new Error(`entries: ${entriesRes.status}`);
                setEntries((await entriesRes.json() as DailyEntry[]).slice().reverse());
                if (snapshotsRes.ok) setSnapshots(await snapshotsRes.json());
                if (ratesRes.ok) {
                    const rd: RatesResponse = await ratesRes.json();
                    if (rd.rates) setRates({ RON_USD: rd.rates.RON_USD, RON_EUR: rd.rates.RON_EUR, fetchedAt: new Date(rd.rates.fetchedAt) });
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    if (loading) return (
        <div className="space-y-6" data-testid="performance-loading">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-[300px] rounded-lg" />
            <Skeleton className="h-[300px] rounded-lg" />
        </div>
    );

    if (error) return (
        <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error}</p>
        </div>
    );

    if (entries.length < 2) return (
        <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-muted-foreground text-sm text-center px-4">
                At least 2 daily entries are required to show evolution charts.
            </p>
        </div>
    );

    // ── Account chart data ────────────────────────────────────────────────────

    const accountData = entries.map(e => {
        const usdRON = rates ? toRON(e.usdTotalValue, "USD", rates) : e.usdTotalValue;
        const etfRON = rates ? toRON(e.etfValueEUR, "EUR", rates) : e.etfValueEUR;
        return {
            date: e.date,
            "Stocks (USD→RON)": Math.round(usdRON),
            "ETF (EUR→RON)": Math.round(etfRON),
            "Free RON": Math.round(e.freeRON),
            "Total": Math.round(usdRON + etfRON + e.freeRON),
            "Deposited": Math.round(e.totalDepositedRON),
            "P&L (RON)": Math.round(usdRON + etfRON + e.freeRON - e.totalDepositedRON),
            // Raw values for tooltip
            _usdRaw: e.usdTotalValue,
            _etfRaw: e.etfValueEUR,
        };
    });

    // ── Per-stock snapshot data ───────────────────────────────────────────────

    const byTicker: Record<string, { data: SnapshotWithPnl[]; color: string }> = {};
    for (const s of snapshots) {
        if (!byTicker[s.ticker]) {
            byTicker[s.ticker] = { data: [], color: COLORS[Object.keys(byTicker).length % COLORS.length] };
        }
        const pnlPct = s.avgBuyPrice > 0 ? (s.currentPrice - s.avgBuyPrice) / s.avgBuyPrice * 100 : 0;
        const pnlDollar = pnlPct !== 0 ? Math.round((s.currentValue * pnlPct / (100 + pnlPct)) * 100) / 100 : 0;
        byTicker[s.ticker].data.push({ ...s, pnlDollar });
    }
    for (const t of Object.keys(byTicker)) byTicker[t].data.sort((a, b) => a.date.localeCompare(b.date));

    // ── Ordered tickers ───────────────────────────────────────────────────────

    const allTickers = Object.keys(byTicker);
    const ordered = [
        ...tickerOrder.filter(t => allTickers.includes(t)),
        ...allTickers.filter(t => !tickerOrder.includes(t)),
    ];

    function onDragStart(t: string) { dragTicker.current = t; }
    function onDragOver(e: React.DragEvent) { e.preventDefault(); }
    function onDrop(target: string) {
        if (!dragTicker.current || dragTicker.current === target) return;
        const next = [...ordered];
        const fi = next.indexOf(dragTicker.current);
        const ti = next.indexOf(target);
        next.splice(fi, 1);
        next.splice(ti, 0, dragTicker.current);
        setTickerOrder(next);
        try { localStorage.setItem("stockHistoryOrder", JSON.stringify(next)); } catch { }
        dragTicker.current = null;
    }

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Performance</h2>

            {/* Expanded modal */}
            {expandedTicker && byTicker[expandedTicker] && (
                <StockModal
                    ticker={expandedTicker}
                    data={byTicker[expandedTicker].data}
                    color={byTicker[expandedTicker].color}
                    onClose={() => setExpandedTicker(null)}
                />
            )}

            {!rates && (
                <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded px-3 py-2">
                    ⚠ Exchange rates unavailable — showing raw values without conversion.
                </div>
            )}

            {/* Chart 1 — Account value over time */}
            <div className="rounded-lg border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-foreground/80 mb-1">Account Value Over Time (RON)</h3>
                <p className="text-xs text-muted-foreground mb-4">All values converted to RON using current exchange rates.</p>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={accountData} margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis yAxisId="left" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#f59e0b" }} />
                        <Tooltip
                            formatter={(v: number, name: string, props: { payload?: Record<string, number> }) => {
                                const p = props.payload ?? {};
                                if (name === "Stocks (USD→RON)") {
                                    return [`${fmtRON(v)} ($${p._usdRaw?.toFixed(2) ?? ""})`, name];
                                }
                                if (name === "ETF (EUR→RON)") {
                                    return [`${fmtRON(v)} (€${p._etfRaw?.toFixed(2) ?? ""})`, name];
                                }
                                return [fmtRON(v), name];
                            }}
                            contentStyle={TOOLTIP_STYLE}
                        />
                        <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                        <Line yAxisId="left" type="monotone" dataKey="Total" stroke="#ffffff" strokeWidth={2.5} dot={{ r: 4 }} />
                        <Line yAxisId="left" type="monotone" dataKey="Stocks (USD→RON)" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                        <Line yAxisId="left" type="monotone" dataKey="ETF (EUR→RON)" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
                        <Line yAxisId="left" type="monotone" dataKey="Free RON" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                        <Line yAxisId="left" type="monotone" dataKey="Deposited" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 2" dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="P&L (RON)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Chart 2 — Per-stock history cards */}
            <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Stock History</h3>
                <p className="text-xs text-muted-foreground mb-4">
                    Click ⤢ to expand a chart. Drag cards to reorder — order is saved.
                    {snapshots.length === 0 && " No stock snapshots yet — ingest a screenshot to start."}
                </p>

                {snapshots.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        Stock history will appear here after your next daily ingestion.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {ordered.map(ticker => {
                            const { data, color } = byTicker[ticker];
                            const latest = data[data.length - 1];
                            const pnlPct = latest.avgBuyPrice > 0
                                ? ((latest.currentPrice - latest.avgBuyPrice) / latest.avgBuyPrice * 100)
                                : 0;
                            const pnlColorClass = pnlPct > 0 ? "text-green-400" : pnlPct < 0 ? "text-red-400" : "text-muted-foreground";
                            const pnlColorHex = pnlPct >= 0 ? "#10b981" : "#f43f5e";
                            const sign = pnlPct >= 0 ? "+" : "";
                            const multiDay = data.length >= 2;

                            return (
                                <div
                                    key={ticker}
                                    className="rounded-lg border border-border bg-card p-4 space-y-3 cursor-grab active:cursor-grabbing"
                                    draggable
                                    onDragStart={() => onDragStart(ticker)}
                                    onDragOver={onDragOver}
                                    onDrop={() => onDrop(ticker)}
                                >
                                    {/* Header */}
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono font-bold text-foreground">{ticker}</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-semibold ${pnlColorClass}`}>
                                                {sign}{pnlPct.toFixed(2)}%
                                            </span>
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); setExpandedTicker(ticker); }}
                                                className="text-muted-foreground hover:text-primary transition-colors text-base px-1 py-0.5 rounded border border-border hover:border-primary"
                                                title="Expand chart"
                                                aria-label={`Expand ${ticker} chart`}
                                            >
                                                ⤢
                                            </button>
                                        </div>
                                    </div>

                                    {/* Key stats */}
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <p className="text-muted-foreground">Buying price</p>
                                            <p className="font-mono text-foreground">${latest.avgBuyPrice.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Actual price</p>
                                            <p className="font-mono text-foreground">${latest.currentPrice.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Total value</p>
                                            <p className="font-mono text-foreground">${latest.currentValue.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">P&L $</p>
                                            <p className={`font-mono font-semibold ${pnlColorClass}`}>
                                                {sign}{(latest.currentValue - (latest.currentValue / (1 + pnlPct / 100))).toFixed(2)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Mini chart */}
                                    {multiDay ? (
                                        <ResponsiveContainer width="100%" height={150}>
                                            <LineChart data={data} margin={{ top: 4, right: 40, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" />
                                                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                                                <YAxis yAxisId="price" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${v}`} />
                                                <YAxis yAxisId="pnl" orientation="right" tick={{ fontSize: 9, fill: pnlColorHex }} />
                                                <Tooltip
                                                    formatter={(v: number, name: string) => [`$${(v as number).toFixed(2)}`, name]}
                                                    contentStyle={{ ...TOOLTIP_STYLE, fontSize: "0.65rem" }}
                                                />
                                                <Line yAxisId="price" type="monotone" dataKey="currentPrice" name="Actual price" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
                                                <Line yAxisId="price" type="monotone" dataKey="avgBuyPrice" name="Avg buy price" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                                                <Line yAxisId="price" type="monotone" dataKey="currentValue" name="Total value $" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                                                <Line yAxisId="pnl" type="monotone" dataKey="pnlDollar" name="P&L $" stroke={pnlColorHex} strokeWidth={2} dot={{ r: 3 }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <p className="text-[10px] text-muted-foreground text-center pt-1">
                                            Chart available after 2+ days of data
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
