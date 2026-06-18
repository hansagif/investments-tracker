import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bnr module before importing the route
vi.mock('@/lib/bnr', () => ({
    fetchRates: vi.fn(),
    BNRError: class BNRError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'BNRError';
        }
    },
}));

// Mock PrismaClient to prevent DB connection during tests
vi.mock('@prisma/client', () => ({
    PrismaClient: vi.fn().mockImplementation(() => ({
        rateCache: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    })),
}));

import { GET } from './route';
import { fetchRates, BNRError } from '@/lib/bnr';

const mockFetchRates = vi.mocked(fetchRates);

describe('GET /api/rates', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns rates with fromCache=false when live fetch succeeds', async () => {
        const fetchedAt = new Date('2024-01-15T10:00:00.000Z');
        mockFetchRates.mockResolvedValue({
            rates: { RON_USD: 4.6234, RON_EUR: 5.0123, fetchedAt },
            fromCache: false,
            cacheAgeMinutes: undefined,
        });

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            rates: {
                RON_USD: 4.6234,
                RON_EUR: 5.0123,
                fetchedAt: '2024-01-15T10:00:00.000Z',
            },
            fromCache: false,
            cacheAgeMinutes: undefined,
        });
    });

    it('returns rates with fromCache=true and cacheAgeMinutes when serving from cache', async () => {
        const fetchedAt = new Date('2024-01-15T08:30:00.000Z');
        mockFetchRates.mockResolvedValue({
            rates: { RON_USD: 4.5900, RON_EUR: 4.9800, fetchedAt },
            fromCache: true,
            cacheAgeMinutes: 90,
        });

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.fromCache).toBe(true);
        expect(body.cacheAgeMinutes).toBe(90);
        expect(body.rates.RON_USD).toBe(4.5900);
        expect(body.rates.RON_EUR).toBe(4.9800);
    });

    it('returns HTTP 503 with error message when BNRError is thrown', async () => {
        const { BNRError: BNRErrorClass } = await import('@/lib/bnr');
        mockFetchRates.mockRejectedValue(
            new BNRErrorClass('Failed to fetch BNR rates and no valid cache exists: BNR feed returned HTTP 503')
        );

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(body).toEqual({
            error: 'Failed to fetch BNR rates and no valid cache exists: BNR feed returned HTTP 503',
        });
    });

    it('returns HTTP 500 with generic message on unexpected errors', async () => {
        mockFetchRates.mockRejectedValue(new Error('Unexpected internal error'));

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body).toEqual({ error: 'Failed to fetch exchange rates' });
    });

    it('surfaces fetchedAt as ISO 8601 string', async () => {
        const fetchedAt = new Date('2024-06-01T14:22:33.456Z');
        mockFetchRates.mockResolvedValue({
            rates: { RON_USD: 4.7, RON_EUR: 5.1, fetchedAt },
            fromCache: false,
        });

        const response = await GET();
        const body = await response.json();

        expect(body.rates.fetchedAt).toBe('2024-06-01T14:22:33.456Z');
    });
});
