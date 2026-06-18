import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock PrismaClient before importing the route
vi.mock('@prisma/client', () => {
    const findMany = vi.fn();
    const findUnique = vi.fn();
    const create = vi.fn();
    const deleteRecord = vi.fn();

    const PrismaClient = vi.fn().mockImplementation(() => ({
        asset: {
            findMany,
            findUnique,
            create,
            delete: deleteRecord,
        },
    }));

    return { PrismaClient };
});

import { GET, POST, DELETE } from './route';
import { PrismaClient } from '@prisma/client';

function makeMocks() {
    const client = new PrismaClient() as ReturnType<typeof PrismaClient> & {
        asset: {
            findMany: ReturnType<typeof vi.fn>;
            findUnique: ReturnType<typeof vi.fn>;
            create: ReturnType<typeof vi.fn>;
            delete: ReturnType<typeof vi.fn>;
        };
    };
    return client.asset;
}

function makeRequest(url: string, options?: RequestInit): NextRequest {
    return new NextRequest(url, options);
}

const validAsset = {
    id: 'cuid-1',
    ticker: 'AAPL',
    name: 'Apple Inc.',
    type: 'Stock',
    sector: 'Technology',
    currentValue: 5.5,
    costBasis: 4.0,
    currency: 'USD',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

const validBody = {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    type: 'Stock',
    sector: 'Technology',
    currentValue: 5.5,
    costBasis: 4.0,
    currency: 'USD',
};

// ─── GET /api/assets ──────────────────────────────────────────────────────────

describe('GET /api/assets', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns assets ordered by ticker ascending', async () => {
        const mocks = makeMocks();
        const rows = [validAsset, { ...validAsset, id: 'cuid-2', ticker: 'MSFT', name: 'Microsoft' }];
        mocks.findMany.mockResolvedValue(rows);

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(rows);
        expect(mocks.findMany).toHaveBeenCalledWith({ orderBy: { ticker: 'asc' } });
    });

    it('returns empty array when no assets exist', async () => {
        const mocks = makeMocks();
        mocks.findMany.mockResolvedValue([]);

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual([]);
    });

    it('returns HTTP 500 with error message on database failure', async () => {
        const mocks = makeMocks();
        mocks.findMany.mockRejectedValue(new Error('DB connection lost'));

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body).toEqual({ error: 'DB connection lost' });
    });
});

// ─── POST /api/assets ─────────────────────────────────────────────────────────

describe('POST /api/assets', () => {
    beforeEach(() => vi.clearAllMocks());

    it('creates a new asset and returns 201', async () => {
        const mocks = makeMocks();
        mocks.findUnique.mockResolvedValue(null);
        mocks.create.mockResolvedValue(validAsset);

        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: JSON.stringify(validBody),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body).toEqual(validAsset);
        expect(mocks.findUnique).toHaveBeenCalledWith({ where: { ticker: 'AAPL' } });
        expect(mocks.create).toHaveBeenCalledWith({
            data: {
                ticker: 'AAPL',
                name: 'Apple Inc.',
                type: 'Stock',
                sector: 'Technology',
                currentValue: 5.5,
                costBasis: 4.0,
                currency: 'USD',
            },
        });
    });

    it('uses empty string for name when name is not provided', async () => {
        const mocks = makeMocks();
        mocks.findUnique.mockResolvedValue(null);
        const assetWithoutName = { ...validAsset, name: '' };
        mocks.create.mockResolvedValue(assetWithoutName);

        const { name: _name, ...bodyWithoutName } = validBody;

        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: JSON.stringify(bodyWithoutName),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);

        expect(response.status).toBe(201);
        expect(mocks.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ name: '' }) })
        );
    });

    it('returns 409 when ticker already exists (duplicate ticker)', async () => {
        const mocks = makeMocks();
        mocks.findUnique.mockResolvedValue(validAsset);

        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: JSON.stringify(validBody),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body).toEqual({ error: 'Duplicate ticker' });
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('returns 400 with field errors when ticker is invalid', async () => {
        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: JSON.stringify({ ...validBody, ticker: 'invalid ticker!' }),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.errors).toHaveProperty('ticker');
    });

    it('returns 400 with field errors when type is invalid', async () => {
        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: JSON.stringify({ ...validBody, type: 'Bond' }),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.errors).toHaveProperty('type');
    });

    it('returns 400 with field errors when sector is invalid', async () => {
        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: JSON.stringify({ ...validBody, sector: 'Crypto' }),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.errors).toHaveProperty('sector');
    });

    it('returns 400 when currentValue is not a positive number', async () => {
        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: JSON.stringify({ ...validBody, currentValue: -1 }),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.errors).toHaveProperty('currentValue');
    });

    it('returns 400 when costBasis is not a positive number', async () => {
        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: JSON.stringify({ ...validBody, costBasis: 0 }),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.errors).toHaveProperty('costBasis');
    });

    it('returns 400 when currency is invalid', async () => {
        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: JSON.stringify({ ...validBody, currency: 'GBP' }),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.errors).toHaveProperty('currency');
    });

    it('returns 400 when request body is not valid JSON', async () => {
        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: 'not-json',
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body).toEqual({ error: 'Invalid JSON body' });
    });

    it('returns HTTP 500 on database failure during asset creation', async () => {
        const mocks = makeMocks();
        mocks.findUnique.mockResolvedValue(null);
        mocks.create.mockRejectedValue(new Error('Disk full'));

        const req = makeRequest('http://localhost/api/assets', {
            method: 'POST',
            body: JSON.stringify(validBody),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body).toEqual({ error: 'Disk full' });
    });
});

// ─── DELETE /api/assets ───────────────────────────────────────────────────────

describe('DELETE /api/assets', () => {
    beforeEach(() => vi.clearAllMocks());

    it('deletes an asset by ticker and returns { deleted: true }', async () => {
        const mocks = makeMocks();
        mocks.delete.mockResolvedValue(validAsset);

        const req = makeRequest('http://localhost/api/assets?ticker=AAPL', {
            method: 'DELETE',
        });
        const response = await DELETE(req);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ deleted: true });
        expect(mocks.delete).toHaveBeenCalledWith({ where: { ticker: 'AAPL' } });
    });

    it('returns 400 when ticker query param is missing', async () => {
        const req = makeRequest('http://localhost/api/assets', {
            method: 'DELETE',
        });
        const response = await DELETE(req);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body).toEqual({ error: 'Missing required query parameter: ticker' });
    });

    it('returns 404 when asset is not found (Prisma P2025)', async () => {
        const mocks = makeMocks();
        const notFoundError = Object.assign(new Error('Record to delete does not exist'), { code: 'P2025' });
        mocks.delete.mockRejectedValue(notFoundError);

        const req = makeRequest('http://localhost/api/assets?ticker=NONEXISTENT', {
            method: 'DELETE',
        });
        const response = await DELETE(req);
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body).toEqual({ error: 'Asset with ticker "NONEXISTENT" not found' });
    });

    it('returns HTTP 500 on database failure', async () => {
        const mocks = makeMocks();
        mocks.delete.mockRejectedValue(new Error('Transaction failed'));

        const req = makeRequest('http://localhost/api/assets?ticker=AAPL', {
            method: 'DELETE',
        });
        const response = await DELETE(req);
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body).toEqual({ error: 'Transaction failed' });
    });
});
