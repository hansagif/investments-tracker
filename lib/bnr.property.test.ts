// Feature: ai-wealth-dashboard, Property 3: BNR cache staleness branch
// Validates: Requirements 1.3

import { test, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------- Prisma mock ----------
// Use vi.hoisted so the mock functions are available inside vi.mock factory
const { mockFindUnique, mockUpsert } = vi.hoisted(() => ({
    mockFindUnique: vi.fn(),
    mockUpsert: vi.fn(),
}));

vi.mock("@prisma/client", () => {
    return {
        PrismaClient: vi.fn().mockImplementation(() => ({
            rateCache: {
                findUnique: mockFindUnique,
                upsert: mockUpsert,
            },
        })),
    };
});

// ---------- fetch mock ----------
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import AFTER mocks are registered
import { fetchRates, BNRError } from "./bnr";

// ---------- Helpers ----------
function makeErrorResponse(status: number) {
    return {
        ok: false,
        status,
        text: () => Promise.resolve(""),
    };
}

// ---------- Property Tests ----------

beforeEach(() => {
    vi.clearAllMocks();
});

/**
 * Property 3: BNR cache staleness branch — cache < 1440 min returns cached rates
 * Validates: Requirements 1.3
 *
 * For any cache age strictly less than 24 hours (< 1440 minutes), when the live
 * fetch fails, fetchRates() SHALL return the cached rates with fromCache === true.
 */
test("Property 3: BNR cache staleness — cache < 1440 min returns cached rates", async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.integer({ min: 0, max: 1439 }), // cache age in minutes — strictly < 24h
            async (ageMinutes) => {
                vi.clearAllMocks();

                // Mock live fetch to fail
                mockFetch.mockResolvedValue(makeErrorResponse(503));

                // Mock getCachedRates to return a cache row with fetchedAt = now - ageMinutes
                const fetchedAt = new Date(Date.now() - ageMinutes * 60_000);
                mockFindUnique.mockResolvedValue({
                    id: "singleton",
                    ronUsd: 4.5,
                    ronEur: 4.95,
                    fetchedAt,
                });

                const result = await fetchRates();

                expect(result.fromCache).toBe(true);
                expect(result.rates.RON_USD).toBe(4.5);
                expect(result.rates.RON_EUR).toBe(4.95);
                // cacheAgeMinutes should be approximately equal to ageMinutes
                expect(result.cacheAgeMinutes).toBeGreaterThanOrEqual(ageMinutes - 1);
                expect(result.cacheAgeMinutes).toBeLessThanOrEqual(ageMinutes + 1);
            }
        ),
        { numRuns: 25 }
    );
});

/**
 * Property 3: BNR cache staleness — cache >= 1440 min throws BNRError
 * Validates: Requirements 1.3
 *
 * For any cache age of exactly 24 hours or more (>= 1440 minutes), when the live
 * fetch fails, fetchRates() SHALL throw a BNRError (stale cache is not served).
 */
test("Property 3: BNR cache staleness — cache >= 1440 min throws BNRError", async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.integer({ min: 1440, max: 50000 }), // cache age >= 24h
            async (ageMinutes) => {
                vi.clearAllMocks();

                // Mock live fetch to fail
                mockFetch.mockResolvedValue(makeErrorResponse(503));

                // Mock getCachedRates to return a stale cache row
                const fetchedAt = new Date(Date.now() - ageMinutes * 60_000);
                mockFindUnique.mockResolvedValue({
                    id: "singleton",
                    ronUsd: 4.5,
                    ronEur: 4.95,
                    fetchedAt,
                });

                await expect(fetchRates()).rejects.toBeInstanceOf(BNRError);
            }
        ),
        { numRuns: 25 }
    );
});
