"use client";

/**
 * Daily Ingestion tab.
 *
 * One page, one Save button. Each day you fill in 4 things:
 *  1. Total RON deposited since account opening (cumulative, updated when you deposit more)
 *  2. Free RON in XTB account (cash sitting in XTB not deployed in USD or EUR)
 *  3. Total ETF value in EUR (full ETF account: deposits + profit)
 *  4. XTB screenshot (USD account) → auto-extracts USD total, free USD funds, P&L
 *
 * Pressing Save creates a DailyEntry row in the DB for today's date.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRefresh } from "@/app/context/RefreshContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OcrResult {
    totalTransactionValue: number | null;
    freeFunds: number | null;
    netProfitLoss: number | null;
    errors: string[];
    rawText?: string;
}

interface FormState {
    totalDepositedRON: string;
    freeRON: string;
    etfValueEUR: string;
    etfDepositedEUR: string;
    usdTotalValue: string;
    usdFreeFunds: string;
    usdNetProfitLoss: string;
    usdRealizedPnl: string;
}

const EMPTY: FormState = {
    totalDepositedRON: "",
    freeRON: "",
    etfValueEUR: "",
    etfDepositedEUR: "",
    usdTotalValue: "",
    usdFreeFunds: "",
    usdNetProfitLoss: "",
    usdRealizedPnl: "7.58",
};

const ACCEPTED_TYPES = new Set(["image/png", "image/jpg", "image/jpeg", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;

function today(): string {
    // Use local date, not UTC — avoids off-by-one in timezones ahead of UTC
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

// ── RawOcrText debug panel ────────────────────────────────────────────────────

function RawOcrText({ text }: { text: string }) {
    const [open, setOpen] = React.useState(false);
    return (
        <div className="rounded-md border border-border bg-muted/20 mt-2">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                aria-expanded={open}
            >
                <span>Raw OCR text (debug)</span>
                <span aria-hidden>{open ? "▲" : "▼"}</span>
            </button>
            {open && (
                <pre className="px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {text || "(empty)"}
                </pre>
            )}
        </div>
    );
}

// ── NumberInput helper ────────────────────────────────────────────────────────

interface NumberInputProps {
    id: string;
    label: string;
    description: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    highlight?: boolean; // orange border when value came from OCR and may need review
}

function NumberInput({ id, label, description, value, onChange, placeholder, highlight }: NumberInputProps) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type="number"
                inputMode="decimal"
                step="any"
                placeholder={placeholder ?? "0.00"}
                value={value}
                onChange={e => onChange(e.target.value)}
                className={highlight ? "border-orange-500 focus-visible:ring-orange-500" : ""}
            />
            <p className="text-xs text-muted-foreground">{description}</p>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DailyLog() {
    const { triggerRefresh } = useRefresh();
    const [form, setForm] = React.useState<FormState>(EMPTY);
    const [date, setDate] = React.useState(today());
    const [ocrStatus, setOcrStatus] = React.useState<"idle" | "loading" | "done" | "error">("idle");
    const [ocrError, setOcrError] = React.useState<string | null>(null);
    const [ocrRawText, setOcrRawText] = React.useState<string | undefined>();
    const [ocrHighlighted, setOcrHighlighted] = React.useState(false);

    const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "success" | "conflict" | "error">("idle");
    const [saveError, setSaveError] = React.useState<string | null>(null);
    const [positionsUpdated, setPositionsUpdated] = React.useState<number | null>(null);
    const [positionsStatus, setPositionsStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
    const [positionsError, setPositionsError] = React.useState<string | null>(null);
    const [pendingFile, setPendingFile] = React.useState<File | null>(null);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [fileName, setFileName] = React.useState<string | null>(null);
    const [fileError, setFileError] = React.useState<string | null>(null);

    // Load last entry to pre-fill the persistent fields (RON deposited, freeRON, ETF)
    React.useEffect(() => {
        fetch("/api/daily-entry")
            .then(r => r.json())
            .then((entries: { totalDepositedRON: number; freeRON: number; etfValueEUR: number; etfDepositedEUR?: number }[]) => {
                if (entries.length > 0) {
                    const last = entries[0];
                    setForm(prev => ({
                        ...prev,
                        totalDepositedRON: last.totalDepositedRON ? String(last.totalDepositedRON) : "",
                        freeRON: last.freeRON ? String(last.freeRON) : "",
                        etfValueEUR: last.etfValueEUR ? String(last.etfValueEUR) : "",
                        etfDepositedEUR: last.etfDepositedEUR ? String(last.etfDepositedEUR) : "",
                        usdRealizedPnl: (last as { usdRealizedPnl?: number }).usdRealizedPnl != null
                            ? String((last as { usdRealizedPnl?: number }).usdRealizedPnl)
                            : "7.58",
                    }));
                }
            })
            .catch(() => { });
    }, []);

    function set(field: keyof FormState, value: string) {
        setForm(prev => ({ ...prev, [field]: value }));
    }

    // ── Clipboard paste support ───────────────────────────────────────────────
    // Cmd+V / Ctrl+V anywhere on the page will read an image from the clipboard

    React.useEffect(() => {
        async function handlePaste(e: ClipboardEvent) {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
                if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) {
                        // Create a named file so the UI shows a filename
                        const named = new File([file], `clipboard-${today()}.png`, { type: file.type });
                        await handleFile(named);
                    }
                    break;
                }
            }
        }
        window.addEventListener("paste", handlePaste);
        return () => window.removeEventListener("paste", handlePaste);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Screenshot handling ───────────────────────────────────────────────────

    async function handleFile(file: File) {
        setFileError(null);
        if (!ACCEPTED_TYPES.has(file.type)) {
            setFileError("Unsupported file type. Please upload PNG, JPG, JPEG, or WEBP.");
            return;
        }
        if (file.size > MAX_SIZE) {
            setFileError("File too large. Maximum size is 10 MB.");
            return;
        }
        setFileName(file.name);
        setOcrStatus("loading");
        setOcrError(null);
        setOcrRawText(undefined);
        setOcrHighlighted(false);

        const fd = new FormData();
        fd.append("image", file);

        try {
            // On upload: only run bottom-bar OCR to fill the form fields.
            // Positions (Asset table + AssetSnapshot) are written on Save, not here.
            let res: Response;
            try {
                res = await fetch("/api/ocr", { method: "POST", body: fd });
            } catch (fetchErr) {
                setOcrStatus("error");
                setOcrError(`Network error — ${(fetchErr as Error).message}. Try again.`);
                return;
            }
            const data: OcrResult = await res.json();
            if (!res.ok) {
                setOcrStatus("error");
                setOcrError((data as { error?: string }).error ?? `OCR error (${res.status})`);
            } else {
                setOcrRawText(data.rawText);
                setForm(prev => ({
                    ...prev,
                    usdTotalValue: data.totalTransactionValue != null ? String(data.totalTransactionValue) : prev.usdTotalValue,
                    usdFreeFunds: data.freeFunds != null ? String(data.freeFunds) : prev.usdFreeFunds,
                    usdNetProfitLoss: data.netProfitLoss != null ? String(data.netProfitLoss) : prev.usdNetProfitLoss,
                }));
                setOcrHighlighted(true);
                setOcrStatus("done");
                setPendingFile(file); // hold file for positions extraction on Save
            }
        } catch (err) {
            setOcrStatus("error");
            setOcrError(`OCR failed: ${(err as Error).message}`);
        }
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    async function save(force = false) {
        setSaveStatus("saving");
        setSaveError(null);
        try {
            const res = await fetch("/api/daily-entry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date,
                    totalDepositedRON: parseFloat(form.totalDepositedRON) || 0,
                    freeRON: parseFloat(form.freeRON) || 0,
                    etfValueEUR: parseFloat(form.etfValueEUR) || 0,
                    etfDepositedEUR: parseFloat(form.etfDepositedEUR) || 0,
                    usdTotalValue: parseFloat(form.usdTotalValue) || 0,
                    usdFreeFunds: parseFloat(form.usdFreeFunds) || 0,
                    usdNetProfitLoss: parseFloat(form.usdNetProfitLoss) || 0,
                    usdRealizedPnl: parseFloat(form.usdRealizedPnl) || 0,
                    force,
                }),
            });

            if (res.status === 409) {
                setSaveStatus("conflict");
                return;
            }
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setSaveStatus("error");
                setSaveError((d as { error?: string }).error ?? `Save failed (${res.status})`);
                return;
            }

            setSaveStatus("success");
            setOcrHighlighted(false);

            // Run positions extraction (updates Asset table + AssetSnapshot),
            // then trigger refresh so LiveDashboard sees fully-updated data.
            if (pendingFile) {
                await runPositionsExtraction(pendingFile, date);
            } else {
                triggerRefresh();
            }
        } catch {
            setSaveStatus("error");
            setSaveError("Network error — could not reach the server.");
        }
    }

    async function runPositionsExtraction(file: File, entryDate: string) {
        setPositionsStatus("loading");
        setPositionsError(null);
        try {
            const fd = new FormData();
            fd.append("image", file);
            fd.append("date", entryDate);
            const r = await fetch("/api/ocr/positions", { method: "POST", body: fd });
            const d = await r.json();
            if (!r.ok) {
                setPositionsStatus("error");
                setPositionsError(d.error ?? `Positions update failed (${r.status})`);
                return;
            }
            setPositionsUpdated(d.updated ?? 0);
            setPositionsStatus("success");
        } catch {
            setPositionsStatus("error");
            setPositionsError("Network error — positions not updated.");
        } finally {
            triggerRefresh();
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Daily Ingestion</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Fill in today&apos;s 4 data points and press Save. One entry per day is stored in the database.
                </p>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
                <Label htmlFor="entry-date">Date</Label>
                <Input
                    id="entry-date"
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-40"
                />
            </div>

            {/* ── Card 1: RON account ── */}
            <Card>
                <CardHeader>
                    <CardTitle>RON Account</CardTitle>
                    <CardDescription>Money in your Romanian account — not deployed in USD or EUR.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <NumberInput
                        id="totalDepositedRON"
                        label="Total RON deposited since beginning"
                        description="Cumulative total of all RON you have ever transferred to your XTB account. Update this only when you deposit more."
                        value={form.totalDepositedRON}
                        onChange={v => set("totalDepositedRON", v)}
                        placeholder="e.g. 4019"
                    />
                    <NumberInput
                        id="freeRON"
                        label="Free RON in XTB account"
                        description="Cash currently sitting in your XTB account in RON — not converted to USD or EUR yet."
                        value={form.freeRON}
                        onChange={v => set("freeRON", v)}
                        placeholder="e.g. 164"
                    />
                </CardContent>
            </Card>

            {/* ── Card 2: ETF EUR account ── */}
            <Card>
                <CardHeader>
                    <CardTitle>ETF Account (EUR)</CardTitle>
                    <CardDescription>Total value of your ETF portfolio in EUR, including all gains.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <NumberInput
                        id="etfValueEUR"
                        label="Total ETF value in EUR (current)"
                        description="The full current value of your ETF account: everything you deposited plus any profit or loss."
                        value={form.etfValueEUR}
                        onChange={v => set("etfValueEUR", v)}
                        placeholder="e.g. 400.55"
                    />
                    <NumberInput
                        id="etfDepositedEUR"
                        label="Total EUR deposited into ETF (cumulative)"
                        description="The total amount in EUR you have ever transferred into the ETF account. Update only when you add more funds."
                        value={form.etfDepositedEUR}
                        onChange={v => set("etfDepositedEUR", v)}
                        placeholder="e.g. 400.00"
                    />
                </CardContent>
            </Card>

            {/* ── Card 3: USD account (screenshot) ── */}
            <Card>
                <CardHeader>
                    <CardTitle>USD Account (XTB Screenshot)</CardTitle>
                    <CardDescription>
                        Drop your daily XTB closing screenshot. Values are extracted automatically — review and correct if needed.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Drop zone */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpg,image/jpeg,image/webp"
                        className="sr-only"
                        tabIndex={-1}
                        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
                        data-testid="file-input"
                    />
                    <div
                        role="button"
                        tabIndex={0}
                        aria-label="Upload XTB screenshot"
                        className={[
                            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer select-none transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/30",
                        ].join(" ")}
                        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                        data-testid="drop-zone"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                Drop your XTB screenshot here, <span className="text-primary underline underline-offset-2">click to browse</span>, or <kbd className="text-xs bg-muted px-1 py-0.5 rounded border border-border font-mono">⌘V</kbd> to paste
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, JPEG, WEBP · max 10 MB</p>
                        </div>
                        {fileName && ocrStatus !== "idle" && (
                            <p className="text-xs text-muted-foreground">{fileName}</p>
                        )}
                    </div>

                    {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}

                    {ocrStatus === "loading" && (
                        <p className="text-sm text-muted-foreground animate-pulse">Parsing screenshot…</p>
                    )}
                    {ocrStatus === "error" && ocrError && (
                        <p role="alert" className="text-sm text-destructive">{ocrError} — you can enter values manually below.</p>
                    )}
                    {ocrStatus === "done" && (
                        <p className="text-sm text-green-400">
                            ✓ Values extracted from screenshot — review and correct if anything looks wrong.
                        </p>
                    )}
                    {ocrRawText !== undefined && <RawOcrText text={ocrRawText} />}

                    {/* USD fields — pre-filled from OCR, editable */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
                        <NumberInput
                            id="usdTotalValue"
                            label="USD Total (stocks + cash)"
                            description="Full USD account value from the screenshot bottom bar."
                            value={form.usdTotalValue}
                            onChange={v => set("usdTotalValue", v)}
                            highlight={ocrHighlighted && !!form.usdTotalValue}
                        />
                        <NumberInput
                            id="usdFreeFunds"
                            label="Free Funds (USD)"
                            description="Unused cash inside your XTB USD account."
                            value={form.usdFreeFunds}
                            onChange={v => set("usdFreeFunds", v)}
                            highlight={ocrHighlighted && !!form.usdFreeFunds}
                        />
                        <NumberInput
                            id="usdNetProfitLoss"
                            label="Net P&amp;L (USD)"
                            description="Profit or loss shown in the screenshot (open positions only)."
                            value={form.usdNetProfitLoss}
                            onChange={v => set("usdNetProfitLoss", v)}
                            highlight={ocrHighlighted && !!form.usdNetProfitLoss}
                        />
                    </div>

                    {/* Realized P&L from closed/sold positions */}
                    <NumberInput
                        id="usdRealizedPnl"
                        label="Realized P&L from sold positions (USD)"
                        description="Cumulative profit/loss from stocks you already sold. Pre-fills from previous entry — update when you close a position."
                        value={form.usdRealizedPnl}
                        onChange={v => set("usdRealizedPnl", v)}
                        placeholder="e.g. 7.58"
                    />
                </CardContent>
            </Card>

            {/* ── Save ── */}
            <div className="space-y-3">
                {saveStatus === "conflict" && (
                    <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-4 space-y-3">
                        <p className="text-sm font-medium text-yellow-300">
                            An entry for {date} already exists. Overwrite it?
                        </p>
                        <div className="flex gap-2">
                            <Button variant="destructive" size="sm" onClick={() => save(true)}>Overwrite</Button>
                            <Button variant="outline" size="sm" onClick={() => setSaveStatus("idle")}>Cancel</Button>
                        </div>
                    </div>
                )}
                {saveStatus === "success" && (
                    <div className="space-y-1">
                        <p role="status" className="text-sm text-green-400">✓ Entry saved for {date}</p>
                        {positionsStatus === "loading" && (
                            <p className="text-sm text-muted-foreground">Updating stock positions…</p>
                        )}
                        {positionsStatus === "success" && (
                            <p className="text-sm text-green-400">✓ {positionsUpdated} position{positionsUpdated !== 1 ? "s" : ""} updated</p>
                        )}
                        {positionsStatus === "error" && (
                            <div className="flex items-center gap-3">
                                <p className="text-sm text-destructive">{positionsError}</p>
                                {pendingFile && (
                                    <button
                                        type="button"
                                        className="text-sm underline text-muted-foreground hover:text-foreground"
                                        onClick={() => runPositionsExtraction(pendingFile, date)}
                                    >
                                        Retry positions
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {saveStatus === "error" && saveError && (
                    <p role="alert" className="text-sm text-destructive">{saveError}</p>
                )}

                {saveStatus !== "conflict" && (
                    <Button
                        size="lg"
                        onClick={() => save(false)}
                        disabled={saveStatus === "saving"}
                        className="w-full sm:w-auto"
                    >
                        {saveStatus === "saving" ? "Saving\u2026" : "Save Today\u2019s Entry"}
                    </Button>
                )}
            </div>
        </div>
    );
}
