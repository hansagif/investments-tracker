"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

interface AppConfig {
    geminiApiToken: string;
    watchlist: string[];
    newsFeeds: string[];
    simulationDefaults: {
        monthlyContribution: number;
        annualGrowthRate: number;
        horizonYears: number;
    };
}

const DEFAULT_CONFIG: AppConfig = {
    geminiApiToken: "",
    watchlist: [],
    newsFeeds: ["https://feeds.finance.yahoo.com/rss/2.0/headline"],
    simulationDefaults: {
        monthlyContribution: 500,
        annualGrowthRate: 7,
        horizonYears: 5,
    },
};

export default function SettingsPage() {
    const [config, setConfig] = React.useState<AppConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

    // New news feed URL draft state
    const [newFeedUrl, setNewFeedUrl] = React.useState("");

    // Load settings on mount
    React.useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/settings");
                if (!res.ok) throw new Error(`Failed to load settings (${res.status})`);
                const data: AppConfig = await res.json();
                const { ocrBackend: _removed, ...rest } = data as AppConfig & { ocrBackend?: unknown };
                setConfig({
                    ...DEFAULT_CONFIG,
                    ...rest,
                    simulationDefaults: {
                        ...DEFAULT_CONFIG.simulationDefaults,
                        ...(data.simulationDefaults ?? {}),
                    },
                });
            } catch (err) {
                setErrorMsg((err as Error).message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setSuccessMsg(null);
        setErrorMsg(null);
        try {
            const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `Save failed (${res.status})`);
            }
            setSuccessMsg("Settings saved");
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setSaving(false);
        }
    }

    function addFeedUrl() {
        const trimmed = newFeedUrl.trim();
        if (!trimmed) return;
        if (config.newsFeeds.includes(trimmed)) return;
        setConfig((prev) => ({ ...prev, newsFeeds: [...prev.newsFeeds, trimmed] }));
        setNewFeedUrl("");
    }

    function removeFeedUrl(url: string) {
        setConfig((prev) => ({
            ...prev,
            newsFeeds: prev.newsFeeds.filter((u) => u !== url),
        }));
    }

    function updateSimDefault(
        field: keyof AppConfig["simulationDefaults"],
        value: string
    ) {
        const num = parseFloat(value);
        setConfig((prev) => ({
            ...prev,
            simulationDefaults: {
                ...prev.simulationDefaults,
                [field]: isNaN(num) ? prev.simulationDefaults[field] : num,
            },
        }));
    }

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <p className="text-muted-foreground text-sm">Loading settings…</p>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-2xl px-4 py-8 space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">Settings</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Configure the OCR backend, API tokens, news sources, and simulation defaults.
                </p>
            </div>

            {/* Feedback banners */}
            {successMsg && (
                <div
                    role="status"
                    aria-live="polite"
                    className="rounded-md bg-green-900/40 border border-green-700 px-4 py-3 text-sm text-green-300"
                >
                    {successMsg}
                </div>
            )}
            {errorMsg && (
                <div
                    role="alert"
                    className="rounded-md bg-destructive/20 border border-destructive px-4 py-3 text-sm text-destructive-foreground"
                >
                    {errorMsg}
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
                {/* ── OCR Backend ── */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Gemini API Token</CardTitle>
                        <CardDescription>
                            Required for OCR screenshot parsing, news ranking, and AI tips.
                            Get your key at{" "}
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                            >
                                aistudio.google.com
                            </a>.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1.5">
                            <Label htmlFor="geminiApiToken">API Token</Label>
                            <Input
                                id="geminiApiToken"
                                type="password"
                                autoComplete="off"
                                placeholder="AIza…"
                                value={config.geminiApiToken}
                                onChange={(e) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        geminiApiToken: e.target.value,
                                    }))
                                }
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* ── News Feed URLs ── */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">News Feed URLs</CardTitle>
                        <CardDescription>
                            RSS or API URLs used by the news aggregator.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {/* Existing URLs */}
                        {config.newsFeeds.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No feeds configured.</p>
                        ) : (
                            <ul className="space-y-2" aria-label="Configured news feed URLs">
                                {config.newsFeeds.map((url) => (
                                    <li
                                        key={url}
                                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2"
                                    >
                                        <span className="text-sm break-all">{url}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-label={`Remove ${url}`}
                                            onClick={() => removeFeedUrl(url)}
                                            className="shrink-0 text-destructive hover:text-destructive"
                                        >
                                            Remove
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {/* Add new URL */}
                        <div className="flex gap-2 pt-1">
                            <Input
                                type="url"
                                placeholder="https://example.com/rss"
                                value={newFeedUrl}
                                onChange={(e) => setNewFeedUrl(e.target.value)}
                                aria-label="New news feed URL"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addFeedUrl();
                                    }
                                }}
                            />
                            <Button type="button" variant="outline" onClick={addFeedUrl}>
                                Add
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* ── Default Simulation Values ── */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Default Simulation Values</CardTitle>
                        <CardDescription>
                            Pre-filled values when opening the Forecast tab.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="monthlyContribution">Monthly Contribution (RON)</Label>
                            <Input
                                id="monthlyContribution"
                                type="number"
                                min="0"
                                step="any"
                                value={config.simulationDefaults.monthlyContribution}
                                onChange={(e) => updateSimDefault("monthlyContribution", e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="annualGrowthRate">Annual Growth Rate (%)</Label>
                            <Input
                                id="annualGrowthRate"
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                value={config.simulationDefaults.annualGrowthRate}
                                onChange={(e) => updateSimDefault("annualGrowthRate", e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="horizonYears">Horizon (Years)</Label>
                            <Input
                                id="horizonYears"
                                type="number"
                                min="1"
                                max="30"
                                step="1"
                                value={config.simulationDefaults.horizonYears}
                                onChange={(e) => updateSimDefault("horizonYears", e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* ── Save button ── */}
                <div className="flex justify-end">
                    <Button type="submit" disabled={saving}>
                        {saving ? "Saving…" : "Save Settings"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
