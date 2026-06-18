import type { Metadata } from "next";
import "./globals.css";
import { TabNavigation } from "@/app/components/tabs/TabNavigation";
import { LiveDashboard } from "@/app/components/tabs/LiveDashboard";
import { DailyLog } from "@/app/components/tabs/DailyLog";
import { News } from "@/app/components/tabs/News";
import { Forecast } from "@/app/components/tabs/Forecast";
import { RefreshProvider } from "@/app/context/RefreshContext";

export const metadata: Metadata = {
    title: "AI Wealth Dashboard",
    description: "Local-first AI-powered wealth and portfolio dashboard",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        /*
         * The `dark` class on <html> activates Tailwind's dark-mode palette
         * (class strategy, see tailwind.config.ts) and applies the CSS custom
         * properties defined in globals.css that guarantee ≥ 4.5:1 contrast
         * (Requirement 8.1).
         */
        <html lang="en" className="dark">
            <body className="min-h-screen bg-background text-foreground antialiased">
                {/*
                 * TabNavigation is the application shell.
                 * - Six named tabs matching Requirement 8.2.
                 * - "Live Dashboard" is the defaultValue (active on first load).
                 * - ARIA Tabs pattern (role="tablist", role="tab", role="tabpanel",
                 *   aria-selected, tabIndex management) is handled by Radix Tabs
                 *   underneath the shadcn primitives (Requirement 8.3).
                 * - The `children` prop from the Next.js page is not used here;
                 *   the full UI lives inside the tab panels. Individual tab content
                 *   components will be passed through the `slots` prop in later tasks.
                 */}
                <RefreshProvider>
                    <TabNavigation
                        slots={{
                            "live-dashboard": <LiveDashboard />,
                            "daily-log": <DailyLog />,
                            "news": <News />,
                            "forecast": <Forecast />,
                        }}
                    />
                </RefreshProvider>
            </body>
        </html>
    );
}
