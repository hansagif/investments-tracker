import { PrismaClient } from "@prisma/client";
import type { ExchangeRates } from "./fx";

// Re-export ExchangeRates so consumers can import from a single place
export type { ExchangeRates };

export interface BNRResult {
    rates: ExchangeRates;
    fromCache: boolean;
    cacheAgeMinutes?: number;
}

export class BNRError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BNRError";
    }
}

const BNR_FEED_URL = "https://www.bnr.ro/nbrfxrates.xml";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

const prisma = new PrismaClient();

/**
 * Parse the BNR XML feed by string searching (no external XML parser).
 * Returns { RON_USD, RON_EUR } or throws if the values cannot be found.
 */
function parseXml(xml: string): { RON_USD: number; RON_EUR: number } {
    /**
     * The feed contains lines like:
     *   <Rate currency="USD">4.6234</Rate>
     *   <Rate currency="EUR">5.0123</Rate>
     *
     * We use a simple regex that matches the currency attribute and the
     * numeric content between the tags.
     */
    const ratePattern = /<Rate\s+currency="([^"]+)"[^>]*>([\d.]+)<\/Rate>/g;

    let RON_USD: number | undefined;
    let RON_EUR: number | undefined;

    let match: RegExpExecArray | null;
    while ((match = ratePattern.exec(xml)) !== null) {
        const currency = match[1];
        const value = parseFloat(match[2]);

        if (currency === "USD") {
            RON_USD = value;
        } else if (currency === "EUR") {
            RON_EUR = value;
        }

        // Stop early once both values are found
        if (RON_USD !== undefined && RON_EUR !== undefined) {
            break;
        }
    }

    if (RON_USD === undefined || RON_EUR === undefined) {
        throw new BNRError(
            "BNR XML feed did not contain USD and/or EUR rates"
        );
    }

    return { RON_USD, RON_EUR };
}

/**
 * Read cached rates from the RateCache SQLite table.
 * Returns null when no cache row exists.
 */
export async function getCachedRates(): Promise<ExchangeRates | null> {
    const row = await prisma.rateCache.findUnique({
        where: { id: "singleton" },
    });

    if (!row) {
        return null;
    }

    return {
        RON_USD: row.ronUsd,
        RON_EUR: row.ronEur,
        fetchedAt: row.fetchedAt,
    };
}

/**
 * Fetch live rates from BNR, falling back to cache when the live fetch
 * fails and the cache is less than 24 hours old.
 *
 * Logic:
 *  1. Attempt live fetch from BNR_FEED_URL.
 *  2. On success: upsert RateCache, return rates with fromCache = false.
 *  3. On failure:
 *     a. If cache age < 24 h → return cached rates with fromCache = true.
 *     b. If cache missing or age ≥ 24 h → throw BNRError.
 */
export async function fetchRates(): Promise<BNRResult> {
    // --- Attempt live fetch ---
    try {
        const response = await fetch(BNR_FEED_URL);

        if (!response.ok) {
            throw new BNRError(
                `BNR feed returned HTTP ${response.status}`
            );
        }

        const xml = await response.text();
        const { RON_USD, RON_EUR } = parseXml(xml);
        const fetchedAt = new Date();

        // Persist to cache (upsert the singleton row)
        await prisma.rateCache.upsert({
            where: { id: "singleton" },
            create: {
                id: "singleton",
                ronUsd: RON_USD,
                ronEur: RON_EUR,
                fetchedAt,
            },
            update: {
                ronUsd: RON_USD,
                ronEur: RON_EUR,
                fetchedAt,
            },
        });

        return {
            rates: { RON_USD, RON_EUR, fetchedAt },
            fromCache: false,
        };
    } catch (liveError) {
        // Live fetch failed — attempt cache fallback
        const cached = await getCachedRates();

        if (cached !== null) {
            const ageMs = Date.now() - cached.fetchedAt.getTime();

            if (ageMs < CACHE_TTL_MS) {
                const cacheAgeMinutes = Math.floor(ageMs / 60_000);
                return {
                    rates: cached,
                    fromCache: true,
                    cacheAgeMinutes,
                };
            }
        }

        // No valid cache — surface the error
        const reason =
            liveError instanceof Error
                ? liveError.message
                : "Unknown error";

        throw new BNRError(
            `Failed to fetch BNR rates and no valid cache exists: ${reason}`
        );
    }
}
