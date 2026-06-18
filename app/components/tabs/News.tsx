"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shape of a single news article returned by /api/news.
 * Matches lib/news/types.ts NewsArticle (publishedAt is serialised as a string
 * over the wire).
 */
interface NewsArticle {
    id: string;
    headline: string;
    source: string;
    /** ISO-8601 string (Date is serialised to string by JSON.stringify) */
    publishedAt: string;
    url: string;
    relevanceTags: string[];
    score: number;
}

interface NewsApiResponse {
    articles?: NewsArticle[];
    /** ISO-8601 string — present when articles were served from the NewsCache */
    cachedAt?: string;
    error?: string;
}

interface AppConfig {
    ocrBackend: "tesseract" | "gemini";
    geminiApiToken: string;
    watchlist: string[];
    newsFeeds: string[];
    simulationDefaults: Partial<{
        monthlyContribution: number;
        annualGrowthRate: number;
        horizonYears: number;
    }>;
}

/** Validates a ticker: 1–10 uppercase alphanumeric characters */
function isValidTicker(value: string): boolean {
    return /^[A-Z0-9]{1,10}$/.test(value);
}

// ─── Date formatting ──────────────────────────────────────────────────────────

/**
 * Format a date-like value as "MMM D, YYYY at H:MM AM/PM".
 * Uses the Intl API so no extra library is required.
 *
 * Example: "Jan 5, 2025 at 3:45 PM"
 */
function formatPublishedAt(value: string | Date): string {
    const d = typeof value === "string" ? new Date(value) : value;
    if (isNaN(d.getTime())) return "Unknown date";

    const datePart = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(d);

    const timePart = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(d);

    return `${datePart} at ${timePart}`;
}

/**
 * Return a human-readable "X minutes ago" / "X hours ago" label for a cached
 * timestamp, used in the staleness indicator (Requirement 5.6).
 */
function formatStaleness(cachedAt: string): string {
    const then = new Date(cachedAt);
    if (isNaN(then.getTime())) return "";

    const diffMs = Date.now() - then.getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMin < 1) return "just now";
    if (diffMin === 1) return "1 minute ago";
    if (diffMin < 60) return `${diffMin} minutes ago`;

    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs === 1) return "1 hour ago";
    return `${diffHrs} hours ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ArticleCardProps {
    article: NewsArticle;
}

/**
 * Renders a single news article card with headline, source, publication
 * timestamp, and relevance tags (Requirement 5.7).
 */
export function ArticleCard({ article }: ArticleCardProps) {
    return (
        <article className="rounded-lg border border-border bg-card p-4 shadow-sm hover:border-border/80 transition-colors">
            {/* Headline — clickable link opening in a new tab */}
            <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm font-semibold text-foreground leading-snug hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
                {article.headline}
            </a>

            {/* Source + timestamp row */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium">{article.source}</span>
                <span aria-hidden>·</span>
                <time dateTime={article.publishedAt}>
                    {formatPublishedAt(article.publishedAt)}
                </time>
            </div>

            {/* Relevance tags */}
            {article.relevanceTags.length > 0 && (
                <div
                    className="mt-3 flex flex-wrap gap-1.5"
                    aria-label="Relevance tags"
                >
                    {article.relevanceTags.map((tag) => (
                        <span
                            key={tag}
                            className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </article>
    );
}

// ─── Watchlist section ───────────────────────────────────────────────────────

/**
 * Watchlist management UI — add/remove ticker symbols stored in AppConfig.
 * Mutations only touch the `watchlist` field; the `assets` array is never
 * modified (Requirement 5.8).
 */
function WatchlistSection() {
    const [watchlist, setWatchlist] = React.useState<string[]>([]);
    const [config, setConfig] = React.useState<AppConfig | null>(null);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [saveError, setSaveError] = React.useState<string | null>(null);
    const [inputValue, setInputValue] = React.useState("");
    const [inputError, setInputError] = React.useState<string | null>(null);

    // Load current config on mount
    React.useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/settings");
                if (!res.ok) throw new Error(`Failed to load settings (${res.status})`);
                const data: AppConfig = await res.json();
                setConfig(data);
                setWatchlist(data.watchlist ?? []);
            } catch (err) {
                setLoadError((err as Error).message);
            }
        }
        load();
    }, []);

    async function persistWatchlist(updatedList: string[]) {
        setSaveError(null);
        if (!config) return;
        try {
            // Only update the watchlist; leave the assets array (managed separately) untouched
            const updatedConfig: AppConfig = { ...config, watchlist: updatedList };
            const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedConfig),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `Save failed (${res.status})`);
            }
            // Keep local config in sync with server response
            const saved: AppConfig = await res.json().catch(() => updatedConfig);
            setConfig(saved);
        } catch (err) {
            setSaveError((err as Error).message);
        }
    }

    function handleAdd() {
        const ticker = inputValue.trim().toUpperCase();
        if (!isValidTicker(ticker)) {
            setInputError("Ticker must be 1–10 uppercase alphanumeric characters.");
            return;
        }
        if (watchlist.includes(ticker)) {
            setInputError(`${ticker} is already in your watchlist.`);
            return;
        }
        setInputError(null);
        const updated = [...watchlist, ticker];
        setWatchlist(updated);
        setInputValue("");
        persistWatchlist(updated);
    }

    function handleRemove(ticker: string) {
        const updated = watchlist.filter((t) => t !== ticker);
        setWatchlist(updated);
        persistWatchlist(updated);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
        }
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        // Allow free typing; convert to uppercase automatically
        setInputValue(e.target.value.toUpperCase());
        setInputError(null);
    }

    return (
        <section aria-labelledby="watchlist-heading" className="space-y-3">
            <h2 id="watchlist-heading" className="text-xl font-semibold tracking-tight text-foreground">
                Watchlist
            </h2>

            {/* Load error */}
            {loadError && (
                <div
                    role="alert"
                    className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
                >
                    <span aria-hidden>✕</span>
                    <span>{loadError}</span>
                </div>
            )}

            {/* Save error toast */}
            {saveError && (
                <div
                    role="alert"
                    aria-live="assertive"
                    className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
                >
                    <span aria-hidden>✕</span>
                    <span>Failed to save watchlist: {saveError}</span>
                </div>
            )}

            {/* Existing watchlist chips */}
            {watchlist.length > 0 ? (
                <ul
                    className="flex flex-wrap gap-2"
                    aria-label="Watchlist items"
                >
                    {watchlist.map((ticker) => (
                        <li key={ticker}>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                                {ticker}
                                <button
                                    type="button"
                                    aria-label={`Remove ${ticker} from watchlist`}
                                    onClick={() => handleRemove(ticker)}
                                    className="rounded-full text-primary/70 hover:text-primary hover:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-none p-0.5"
                                >
                                    ×
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                !loadError && (
                    <p className="text-sm text-muted-foreground">
                        No tickers in your watchlist. Add one below.
                    </p>
                )
            )}

            {/* Add ticker input */}
            <div className="space-y-1.5">
                <div className="flex gap-2">
                    <Input
                        type="text"
                        placeholder="e.g. NVDA"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        aria-label="Ticker symbol to add to watchlist"
                        aria-describedby={inputError ? "watchlist-input-error" : undefined}
                        className="w-40"
                        maxLength={10}
                    />
                    <Button type="button" variant="outline" onClick={handleAdd}>
                        Add
                    </Button>
                </div>
                {inputError && (
                    <p
                        id="watchlist-input-error"
                        role="alert"
                        className="text-xs text-destructive"
                    >
                        {inputError}
                    </p>
                )}
            </div>
        </section>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * News tab — fetches articles from /api/news, renders each as an ArticleCard,
 * and displays a staleness indicator when articles are served from cache
 * (Requirement 5.6) or an error message when the fetch fails (Requirement 5.6).
 * Supports manual refresh via /api/news?refresh=true to bypass the 15-minute
 * cache (Requirement 5.1).
 *
 * Requirements: 5.1, 5.6, 5.7
 */
export function News() {
    const [articles, setArticles] = React.useState<NewsArticle[]>([]);
    const [cachedAt, setCachedAt] = React.useState<string | undefined>(undefined);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);

    /**
     * Fetch news articles from the API. When `forceRefresh` is true, appends
     * `?refresh=true` to bypass the 15-minute server-side cache (Requirement 5.1).
     */
    async function load(forceRefresh = false) {
        if (forceRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);
        try {
            const url = forceRefresh ? "/api/news?refresh=true" : "/api/news";
            const res = await fetch(url);
            const data: NewsApiResponse = await res.json();

            if (!res.ok || data.error) {
                // Surface the error message (Requirement 5.6)
                setError(data.error ?? "Unable to load news. Please try again.");
                setArticles([]);
                setCachedAt(undefined);
            } else {
                setArticles(data.articles ?? []);
                // Clear stale cachedAt when a fresh fetch succeeds
                setCachedAt(forceRefresh ? undefined : data.cachedAt);
                setError(null);
            }
        } catch {
            setError("Unable to load news. Please try again.");
            setArticles([]);
            setCachedAt(undefined);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    React.useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isLoading = loading || refreshing;

    // ── Loading state (initial load only) ────────────────────────────────────
    if (loading) {
        return (
            <div className="space-y-4" data-testid="news-loading">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-24" />
                </div>
                {/* Skeleton: 4 article cards */}
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <div className="flex gap-2">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-3 w-28" />
                        </div>
                        <div className="flex gap-2">
                            <Skeleton className="h-5 w-12 rounded-full" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">News</h2>
                {/* Manual refresh button — calls /api/news?refresh=true (Requirement 5.1) */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => load(true)}
                    disabled={isLoading}
                    aria-label="Refresh news"
                >
                    {refreshing ? (
                        <>
                            {/* Spinner icon */}
                            <svg
                                className="mr-1.5 h-3.5 w-3.5 animate-spin"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                />
                            </svg>
                            Refreshing…
                        </>
                    ) : (
                        <>
                            {/* Refresh icon */}
                            <svg
                                className="mr-1.5 h-3.5 w-3.5"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                                aria-hidden="true"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                />
                            </svg>
                            Refresh
                        </>
                    )}
                </Button>
            </div>

            {/* ── Staleness indicator (shown when articles come from cache) ── */}
            {!error && cachedAt && (
                <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400"
                >
                    <span aria-hidden>⏱</span>
                    <span>Last updated {formatStaleness(cachedAt)}</span>
                </div>
            )}

            {/* ── Error message (Requirement 5.6) ── */}
            {error && (
                <div
                    role="alert"
                    className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
                >
                    <span aria-hidden>✕</span>
                    <span>{error}</span>
                </div>
            )}

            {/* ── Empty state ── */}
            {!error && articles.length === 0 && (
                <div className="flex min-h-[30vh] items-center justify-center rounded-lg border border-dashed border-border">
                    <p className="text-muted-foreground text-sm">
                        No relevant articles found. Configure news feeds or add assets to your watchlist.
                    </p>
                </div>
            )}

            {/* ── Article list ── */}
            {articles.length > 0 && (
                <ul className="space-y-3" aria-label="News articles">
                    {articles.map((article) => (
                        <li key={article.id}>
                            <ArticleCard article={article} />
                        </li>
                    ))}
                </ul>
            )}

            {/* ── Watchlist management (Requirement 5.8) ── */}
            <hr className="border-border" />
            <WatchlistSection />
        </div>
    );
}
