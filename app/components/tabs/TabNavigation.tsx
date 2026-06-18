"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Allocation } from "@/app/components/tabs/Allocation";
import { Performance } from "@/app/components/tabs/Performance";
import SettingsPage from "@/app/settings/page";

/**
 * The six core tab labels for the AI Wealth Dashboard.
 * Order matches Requirement 8.2.
 */
const TABS = [
    { id: "live-dashboard", label: "Live Dashboard" },
    { id: "allocation", label: "Stocks" },
    { id: "performance", label: "Performance" },
    { id: "news", label: "News" },
    { id: "forecast", label: "Forecast" },
    { id: "daily-log", label: "Daily Log" },
    { id: "settings", label: "⚙ Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface TabNavigationProps {
    /** Slot map: each key is a tab id; the value is the content to render in that panel. */
    slots?: Partial<Record<TabId, React.ReactNode>>;
}

/**
 * Root tab navigation shell.
 *
 * Keyboard behaviour (ARIA Tabs pattern — Requirement 8.3):
 *  - Tab key moves browser focus into the tab list (Radix default)
 *  - Arrow Left / Arrow Right navigate between tabs (Radix default)
 *  - Enter / Space activate the focused tab (Radix default)
 *
 * Radix TabsPrimitive handles all aria-* attributes automatically:
 *  role="tablist", role="tab", role="tabpanel", aria-selected, aria-controls, tabIndex management.
 */
/** Default slot content — wired tab panels. */
const DEFAULT_SLOTS: Partial<Record<TabId, React.ReactNode>> = {
    performance: <Performance />,
    allocation: <Allocation />,
    settings: <SettingsPage />,
};

export function TabNavigation({ slots = {} }: TabNavigationProps) {
    const mergedSlots = { ...DEFAULT_SLOTS, ...slots };

    return (
        <Tabs
            defaultValue="live-dashboard"
            className="flex min-h-screen flex-col"
        >
            {/* ── Tab list ── */}
            <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6">
                    <div className="flex items-center justify-between py-3">
                        <span className="text-sm font-semibold tracking-wide text-foreground/80 hidden sm:block">
                            AI Wealth Dashboard
                        </span>
                        {/* Full-width scrollable tab list on narrow viewports */}
                        <TabsList
                            className="flex h-auto flex-1 overflow-x-auto sm:flex-none bg-secondary/40 p-1 gap-0.5"
                            aria-label="Dashboard sections"
                        >
                            {TABS.map(({ id, label }) => (
                                <TabsTrigger
                                    key={id}
                                    value={id}
                                    className="
                                            shrink-0 whitespace-nowrap px-3 py-1.5 text-sm font-medium
                                            text-muted-foreground
                                            data-[state=active]:bg-background
                                            data-[state=active]:text-foreground
                                            data-[state=active]:shadow-sm
                                            focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1
                                            rounded-sm transition-colors
                                        "
                                >
                                    {label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>
                </div>
            </header>

            {/* ── Tab panels ── */}
            <main className="flex-1">
                <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 py-6">
                    {TABS.map(({ id }) => (
                        <TabsContent
                            key={id}
                            value={id}
                            className="mt-0 focus-visible:ring-0 focus-visible:outline-none"
                        >
                            {mergedSlots[id] ?? (
                                <PlaceholderPanel label={TABS.find((t) => t.id === id)!.label} />
                            )}
                        </TabsContent>
                    ))}
                </div>
            </main>
        </Tabs >
    );
}

/** Temporary placeholder rendered until each tab's real component is wired in. */
function PlaceholderPanel({ label }: { label: string }) {
    return (
        <div
            className="flex min-h-[60vh] items-center justify-center rounded-lg border border-dashed border-border"
            aria-label={`${label} placeholder`}
        >
            <p className="text-muted-foreground text-sm">{label} — coming soon</p>
        </div>
    );
}
