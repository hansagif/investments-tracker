/**
 * Unit tests for BNR_Service (/lib/bnr.ts)
 *
 * These tests mock `fetch` (for HTTP requests) and `@prisma/client` (for the
 * SQLite cache) so the suite runs without a live database or network.
 *
 * Covers:
 *  - Successful live fetch → parse, upsert cache, return fromCache=false
 *  - Live fetch HTTP error → fall back to fresh cache
 *  - Live fetch HTTP error → fall back to stale cache (≥24h) → throw BNRError
 *  - Live fetch HTTP error → no cache at all → throw BNRError
 *  - Network error (fetch throws) → fall back to fresh cache
 *  - XML parsing: USD and EUR rates extracted correctly
 *  - getCachedRates returns null when no row exists
 *  - getCachedRates maps row fields to ExchangeRates correctly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { fetchRates, getCachedRates, BNRError } from "./bnr";

// ---------- Helpers ----------
const SAMPLE_XML = `
<DataSet>
  <Body>
    <Cube date="2024-01-15">
      <Rate currency="USD">4.6234</Rate>
      <Rate currency="EUR">5.0123</Rate>
      <Rate currency="CHF">5.2000</Rate>
    </Cube>
  </Body>
</DataSet>
`;

function makeOkResponse(body: string) {
    return {
        ok: true,
        status: 200,
        text: () => Promise.resolve(body),
    };
}

function makeErrorResponse(status: number) {
    return {
        ok: false,
        status,
        text: () => Promise.resolve(""),
    };
}

const FRESH_CACHE_ROW = {
    id: "singleton",
    ronUsd: 4.5,
    ronEur: 4.95,
    fetchedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
};

const STALE_CACHE_ROW = {
    id: "singleton",
    ronUsd: 4.5,
    ronEur: 4.95,
    fetchedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
};

// ---------- Tests ----------

describe("fetchRates", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns live rates and persists cache on successful fetch", async () => {
        mockFetch.mockResolvedValue(makeOkResponse(SAMPLE_XML));
        mockUpsert.mockResolvedValue({});

        const result = await fetchRates();

        expect(result.fromCache).toBe(false);
        expect(result.rates.RON_USD).toBeCloseTo(4.6234);
        expect(result.rates.RON_EUR).toBeCloseTo(5.0123);
        expect(result.cacheAgeMinutes).toBeUndefined();

        // Cache must be written
        expect(mockUpsert).toHaveBeenCalledOnce();
        const upsertCall = mockUpsert.mock.calls[0][0];
        expect(upsertCall.where).toEqual({ id: "singleton" });
        expect(upsertCall.create.ronUsd).toBeCloseTo(4.6234);
        expect(upsertCall.create.ronEur).toBeCloseTo(5.0123);
    });

    it("returns fresh cache when live fetch returns HTTP 4xx", async () => {
        mockFetch.mockResolvedValue(makeErrorResponse(429));
        mockFindUnique.mockResolvedValue(FRESH_CACHE_ROW);

        const result = await fetchRates();

        expect(result.fromCache).toBe(true);
        expect(result.rates.RON_USD).toBe(4.5);
        expect(result.rates.RON_EUR).toBe(4.95);
        expect(result.cacheAgeMinutes).toBeGreaterThanOrEqual(59);
        expect(result.cacheAgeMinutes).toBeLessThan(62);
    });

    it("throws BNRError when live fetch fails and cache is stale (≥24h)", async () => {
        mockFetch.mockResolvedValue(makeErrorResponse(503));
        mockFindUnique.mockResolvedValue(STALE_CACHE_ROW);

        await expect(fetchRates()).rejects.toBeInstanceOf(BNRError);
    });

    it("throws BNRError when live fetch fails and no cache exists", async () => {
        mockFetch.mockResolvedValue(makeErrorResponse(500));
        mockFindUnique.mockResolvedValue(null);

        await expect(fetchRates()).rejects.toBeInstanceOf(BNRError);
    });

    it("falls back to fresh cache when fetch throws a network error", async () => {
        mockFetch.mockRejectedValue(new TypeError("network failure"));
        mockFindUnique.mockResolvedValue(FRESH_CACHE_ROW);

        const result = await fetchRates();

        expect(result.fromCache).toBe(true);
        expect(result.rates.RON_USD).toBe(4.5);
    });

    it("throws BNRError when fetch throws and cache is stale", async () => {
        mockFetch.mockRejectedValue(new TypeError("network failure"));
        mockFindUnique.mockResolvedValue(STALE_CACHE_ROW);

        await expect(fetchRates()).rejects.toBeInstanceOf(BNRError);
    });

    it("parses fetchedAt timestamp and stores it in the returned rates", async () => {
        const before = Date.now();
        mockFetch.mockResolvedValue(makeOkResponse(SAMPLE_XML));
        mockUpsert.mockResolvedValue({});

        const result = await fetchRates();
        const after = Date.now();

        expect(result.rates.fetchedAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(result.rates.fetchedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it("throws BNRError when XML is missing USD rate", async () => {
        const xmlNoUsd = `<DataSet><Body><Cube date="2024-01-15"><Rate currency="EUR">5.0123</Rate></Cube></Body></DataSet>`;
        mockFetch.mockResolvedValue(makeOkResponse(xmlNoUsd));
        mockFindUnique.mockResolvedValue(null);

        await expect(fetchRates()).rejects.toBeInstanceOf(BNRError);
    });

    it("throws BNRError when XML is missing EUR rate", async () => {
        const xmlNoEur = `<DataSet><Body><Cube date="2024-01-15"><Rate currency="USD">4.6234</Rate></Cube></Body></DataSet>`;
        mockFetch.mockResolvedValue(makeOkResponse(xmlNoEur));
        mockFindUnique.mockResolvedValue(null);

        await expect(fetchRates()).rejects.toBeInstanceOf(BNRError);
    });
});

describe("getCachedRates", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns null when no row exists in the database", async () => {
        mockFindUnique.mockResolvedValue(null);

        const result = await getCachedRates();

        expect(result).toBeNull();
        expect(mockFindUnique).toHaveBeenCalledWith({
            where: { id: "singleton" },
        });
    });

    it("maps RateCache row to ExchangeRates correctly", async () => {
        const fetchedAt = new Date("2024-01-15T10:00:00.000Z");
        mockFindUnique.mockResolvedValue({
            id: "singleton",
            ronUsd: 4.6234,
            ronEur: 5.0123,
            fetchedAt,
        });

        const result = await getCachedRates();

        expect(result).not.toBeNull();
        expect(result!.RON_USD).toBe(4.6234);
        expect(result!.RON_EUR).toBe(5.0123);
        expect(result!.fetchedAt).toEqual(fetchedAt);
    });
});

describe("BNRError", () => {
    it("is an instance of Error", () => {
        const err = new BNRError("test");
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(BNRError);
        expect(err.name).toBe("BNRError");
        expect(err.message).toBe("test");
    });
});
