/**
 * Delta_Tracker — pure computation module.
 *
 * Accepts two ClosingSnapshot values and returns a SnapshotDelta describing
 * the change between them, including winners/losers and an estimated
 * attribution breakdown.
 */

// ─── Type definitions ─────────────────────────────────────────────────────────

/** A numeric pair expressing an absolute and percentage change. */
export interface DeltaValue {
    /** b - a */
    absolute: number;
    /** (b - a) / a * 100. NaN when previous (a) === 0. */
    percentage: number;
}

/** Per-asset absolute change for the winners / losers lists. */
export interface AssetDelta {
    ticker: string;
    /** Absolute change in asset value (currency-native). */
    delta: number;
}

/**
 * Estimated attribution breakdown.
 * All components are expressed as DeltaValues of the total portfolio delta.
 */
export interface Attribution {
    /** Change attributed to asset price movement. */
    priceAppreciation: DeltaValue;
    /**
     * Change attributed to FX rate movements.
     * Set to zero when cross-snapshot rates are unavailable (typical case).
     */
    currencyMovement: DeltaValue;
    /**
     * Change attributed to new capital deposits.
     * Estimated as the positive change in Free Funds.
     */
    newDeposits: DeltaValue;
}

/** Full delta between two consecutive ClosingSnapshots. */
export interface SnapshotDelta {
    totalTransactionValue: DeltaValue;
    freeFunds: DeltaValue;
    netProfitLoss: DeltaValue;
    /** null when attribution cannot be estimated (e.g., prev total is 0). */
    attribution: Attribution | null;
    /** Top 5 assets with the largest positive absolute change, descending. */
    winners: AssetDelta[];
    /** Top 5 assets with the largest negative absolute change, ascending. */
    losers: AssetDelta[];
}

/**
 * Minimal shape of a ClosingSnapshot that calculateDelta requires.
 * Matches the Prisma-generated ClosingSnapshot model.
 */
export interface ClosingSnapshot {
    totalTransactionValue: number;
    freeFunds: number;
    netProfitLoss: number;
    currency?: string;
}

/** Asset snapshot for winners/losers computation. */
export interface AssetSnapshot {
    ticker: string;
    currentValue: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute a DeltaValue from two scalar numbers.
 * percentageDelta is NaN when prev === 0.
 */
function makeDeltaValue(prev: number, curr: number): DeltaValue {
    const absolute = curr - prev;
    const percentage = prev === 0 ? NaN : (absolute / prev) * 100;
    return { absolute, percentage };
}

/**
 * Returns the CSS color class appropriate for a given delta value.
 *
 * - Strictly positive → 'text-positive' (green)
 * - Strictly negative → 'text-negative' (red)
 * - Zero              → '' (no color)
 */
export function getDeltaColorClass(
    value: number
): "text-positive" | "text-negative" | "" {
    if (value > 0) return "text-positive";
    if (value < 0) return "text-negative";
    return "";
}

// ─── Core function ─────────────────────────────────────────────────────────────

/**
 * Calculate the delta between two ClosingSnapshots.
 *
 * @param prev  Earlier (older) snapshot — treated as the baseline.
 * @param curr  More recent snapshot.
 * @param prevAssets  Asset positions as of prev snapshot (optional).
 * @param currAssets  Asset positions as of curr snapshot (optional).
 *
 * Winners/losers are derived from the per-asset changes when both asset lists
 * are supplied.  When they are omitted (or empty), winners and losers will be
 * empty arrays.
 */
export function calculateDelta(
    prev: ClosingSnapshot,
    curr: ClosingSnapshot,
    prevAssets: AssetSnapshot[] = [],
    currAssets: AssetSnapshot[] = []
): SnapshotDelta {
    // ── Core field deltas ──────────────────────────────────────────────────────
    const totalTransactionValue = makeDeltaValue(
        prev.totalTransactionValue,
        curr.totalTransactionValue
    );
    const freeFunds = makeDeltaValue(prev.freeFunds, curr.freeFunds);
    const netProfitLoss = makeDeltaValue(prev.netProfitLoss, curr.netProfitLoss);

    // ── Attribution ────────────────────────────────────────────────────────────
    let attribution: Attribution | null = null;

    const totalDelta = totalTransactionValue.absolute;
    const prevTotal = prev.totalTransactionValue;

    if (prevTotal !== 0) {
        // New deposits ≈ positive change in free funds (capital injected by user).
        const newDepositsAbsolute = Math.max(0, freeFunds.absolute);

        // Currency movement: we don't have cross-snapshot FX rates, so set to 0.
        const currencyMovementAbsolute = 0;

        // Price appreciation = total delta minus deposits and currency movement.
        const priceAppreciationAbsolute =
            totalDelta - newDepositsAbsolute - currencyMovementAbsolute;

        attribution = {
            priceAppreciation: makeDeltaValue(
                prevTotal,
                prevTotal + priceAppreciationAbsolute
            ),
            currencyMovement: makeDeltaValue(prevTotal, prevTotal + currencyMovementAbsolute),
            newDeposits: makeDeltaValue(prevTotal, prevTotal + newDepositsAbsolute),
        };
    }

    // ── Winners / losers ───────────────────────────────────────────────────────
    const winners: AssetDelta[] = [];
    const losers: AssetDelta[] = [];

    if (prevAssets.length > 0 || currAssets.length > 0) {
        // Build a map of prev values keyed by ticker.
        const prevMap = new Map<string, number>(
            prevAssets.map((a) => [a.ticker, a.currentValue])
        );

        // Compute per-asset delta for every ticker present in currAssets.
        const assetDeltas: AssetDelta[] = currAssets.map((a) => ({
            ticker: a.ticker,
            delta: a.currentValue - (prevMap.get(a.ticker) ?? 0),
        }));

        // Also include assets that disappeared (were in prev but not in curr).
        const currTickers = new Set(currAssets.map((a) => a.ticker));
        for (const a of prevAssets) {
            if (!currTickers.has(a.ticker)) {
                assetDeltas.push({ ticker: a.ticker, delta: -a.currentValue });
            }
        }

        // Separate positive and negative changes.
        const positive = assetDeltas
            .filter((d) => d.delta > 0)
            .sort((a, b) => b.delta - a.delta); // descending

        const negative = assetDeltas
            .filter((d) => d.delta < 0)
            .sort((a, b) => a.delta - b.delta); // ascending (most negative first)

        winners.push(...positive.slice(0, 5));
        losers.push(...negative.slice(0, 5));
    }

    return {
        totalTransactionValue,
        freeFunds,
        netProfitLoss,
        attribution,
        winners,
        losers,
    };
}
