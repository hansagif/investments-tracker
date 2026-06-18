"use client";

/**
 * RefreshContext — lightweight cross-tab refresh signal.
 *
 * When the Daily Log saves a new entry, it calls `triggerRefresh()`.
 * Any tab that depends on daily data subscribes to `refreshCount` and
 * re-fetches whenever the count changes.
 */

import * as React from "react";

interface RefreshContextValue {
    refreshCount: number;
    triggerRefresh: () => void;
}

const RefreshContext = React.createContext<RefreshContextValue>({
    refreshCount: 0,
    triggerRefresh: () => { },
});

export function RefreshProvider({ children }: { children: React.ReactNode }) {
    const [refreshCount, setRefreshCount] = React.useState(0);
    const triggerRefresh = React.useCallback(() => {
        setRefreshCount(n => n + 1);
    }, []);
    return (
        <RefreshContext.Provider value={{ refreshCount, triggerRefresh }}>
            {children}
        </RefreshContext.Provider>
    );
}

export function useRefresh() {
    return React.useContext(RefreshContext);
}
