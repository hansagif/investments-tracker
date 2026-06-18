"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const TAB_IDS = [
    "live-dashboard",
    "daily-log",
    "performance",
    "allocation",
    "news",
    "forecast",
] as const;

type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
    "live-dashboard": "Live Dashboard",
    "daily-log": "Daily Log",
    performance: "Performance",
    allocation: "Allocation",
    news: "News",
    forecast: "Forecast",
};

interface TabShellProps {
    /** Slot map: each key is a tab id, value is the content to render. */
    panels?: Partial<Record<TabId, React.ReactNode>>;
    /** Override the default active tab. */
    defaultTab?: TabId;
    className?: string;
}

/**
 * TabShell — the top-level navigation container for the AI Wealth Dashboard.
 *
 * Layout behaviour (Requirement 8.4):
 *  - Viewports < 768 px  →  single-column, tab list stacks vertically (flex-col)
 *  - Viewports ≥ 768 px  →  desktop layout, tab list is a horizontal bar (flex-row)
 *
 * Keyboard navigation (Requirement 8.3, ARIA Tabs pattern):
 *  Radix Tabs handles this natively:
 *  - Tab key focuses the tab list
 *  - Left/Right arrow keys navigate between tabs
 *  - Enter/Space activates the focused tab
 */
export function TabShell({
    panels = {},
    defaultTab = "live-dashboard",
    className,
}: TabShellProps) {
    return (
        <Tabs
            defaultValue={defaultTab}
            className={cn(
                // Full-width container; flex column on mobile, row on desktop
                "flex w-full flex-col",
                className
            )}
        >
            {/*
             * Tab list wrapper
             *
             * Mobile  (< 768 px):  single-column — tab list takes full width,
             *                      tabs flow vertically.
             * Desktop (≥ 768 px):  horizontal bar spanning full width.
             *
             * The `md:` prefix maps to Tailwind's 768px breakpoint (min-width: 768px).
             */}
            <div
                className={cn(
                    // Mobile: full-width column so the list stretches edge-to-edge
                    "w-full",
                    // Desktop: keep the nav at the top in a row
                    "md:flex md:items-center md:border-b md:border-border"
                )}
                role="navigation"
                aria-label="Dashboard sections"
            >
                <TabsList
                    className={cn(
                        // Mobile: full-width, vertical stack
                        "flex h-auto w-full flex-col rounded-none bg-card px-0",
                        // Desktop: horizontal row, auto height, standard bar styling
                        "md:h-10 md:flex-row md:rounded-none md:bg-transparent md:p-0"
                    )}
                >
                    {TAB_IDS.map((id) => (
                        <TabsTrigger
                            key={id}
                            value={id}
                            className={cn(
                                // Mobile: full-width buttons, generous tap target
                                "w-full justify-start rounded-none px-4 py-3 text-left text-sm",
                                // Desktop: auto-width, horizontal layout
                                "md:w-auto md:justify-center md:border-b-2 md:border-transparent md:rounded-none md:py-2 md:px-4",
                                // Active state on desktop underlines the active tab
                                "md:data-[state=active]:border-primary md:data-[state=active]:bg-transparent md:data-[state=active]:shadow-none"
                            )}
                        >
                            {TAB_LABELS[id]}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>

            {/*
             * Content area
             *
             * Mobile  (< 768 px):  single-column, full width
             * Desktop (≥ 768 px):  full width with standard padding
             */}
            <div className="w-full p-4 md:p-6">
                {TAB_IDS.map((id) => (
                    <TabsContent
                        key={id}
                        value={id}
                        className={cn(
                            // Full-width single-column on mobile and desktop
                            "w-full",
                            "mt-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                        )}
                    >
                        {panels[id] ?? (
                            <p className="text-muted-foreground text-sm">
                                {TAB_LABELS[id]} — coming soon.
                            </p>
                        )}
                    </TabsContent>
                ))}
            </div>
        </Tabs>
    );
}
