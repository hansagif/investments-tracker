import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock PrismaClient before importing the route
vi.mock('@prisma/client', () => {
    const findMany = vi.fn();
    const findUnique = vi.fn();
    const create = vi.fn();
    const update = vi.fn();
    const deleteRecord = vi.fn();

    const PrismaClient = vi.fn().mockImplementation(() => ({
        closingSnapshot: {
            findMany,
            findUnique,
            create,
            update,
            delete: deleteRecord,
        },
    }));

    return { PrismaClient };
});

import { GET, POST, DELETE } from './route';
import { PrismaClient } from '@prisma/client';

function makeMocks() {
    const client = new PrismaClient() as ReturnType<typeof PrismaClient> & {
        closingSnapshot: {
            findMany: ReturnType<typeof vi.fn>;
            findUnique: ReturnType<typeof vi.fn>;
            create: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
            delete: ReturnType<typeof vi.fn>;
        };
    };
    return client.closingSnapshot;
}

function makeRequest(url: string, options?: RequestInit): NextRequest {
    return new NextRequest(url, options);
}

describe('GET /api/snapshots', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns snapshots ordered by date descending', async () => {
        const mocks = makeMocks();
        const rows = [
            { id: '2', date: '2024-01-02', totalTransactionValue: 200, freeFunds: 50, netProfitLoss: 5, currency: 'USD' },
            { id: '1', date: '2024-01-01', totalTransactionValue: 100, freeFunds: 25, netProfitLoss: -2, currency: 'USD' },
        ];
        mocks.findMany.mockResolvedValue(rows);

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(rows);
        expect(mocks.findMany).toHaveBeenCalledWith({ orderBy: { date: 'desc' } });
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

describe('POST /api/snapshots', () => {
    beforeEach(() => vi.clearAllMocks());

    const validBody = {
        date: '2024-01-15',
        totalTransactionValue: 9823.45,
        freeFunds: 241.60,
        netProfitLoss: -12.30,
        currency: 'USD',
    };

    it('creates a new snapshot when no conflict exists', async () => {
        const mocks = makeMocks();
        mocks.findUnique.mockResolvedValue(null);
        const created = { id: 'abc', ...validBody };
        mocks.create.mockResolvedValue(created);

        const req = makeRequest('http://localhost/api/snapshots', {
            method: 'POST',
            body: JSON.stringify(validBody),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body).toEqual(created);
    });

    it('returns 409 with conflict info when snapshot for date already exists and no force param', async () => {
        const mocks = makeMocks();
        const existing = { id: 'existing-id', ...validBody };
        mocks.findUnique.mockResolvedValue(existing);

        const req = makeRequest('http://localhost/api/snapshots', {
            method: 'POST',
            body: JSON.stringify(validBody),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body).toEqual({ conflict: true, existingId: 'existing-id' });
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('overwrites existing snapshot when ?force=true is provided', async () => {
        const mocks = makeMocks();
        const existing = { id: 'existing-id', ...validBody };
        mocks.findUnique.mockResolvedValue(existing);
        const updated = { id: 'existing-id', ...validBody, totalTransactionValue: 9999 };
        mocks.update.mockResolvedValue(updated);

        const req = makeRequest('http://localhost/api/snapshots?force=true', {
            method: 'POST',
            body: JSON.stringify({ ...validBody, totalTransactionValue: 9999 }),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(updated);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).toHaveBeenCalledWith({
            where: { id: 'existing-id' },
            data: {
                totalTransactionValue: 9999,
                freeFunds: validBody.freeFunds,
                netProfitLoss: validBody.netProfitLoss,
                currency: 'USD',
            },
        });
    });

    it('returns HTTP 500 with error message on database failure', async () => {
        const mocks = makeMocks();
        mocks.findUnique.mockRejectedValue(new Error('Disk full'));

        const req = makeRequest('http://localhost/api/snapshots', {
            method: 'POST',
            body: JSON.stringify(validBody),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body).toEqual({ error: 'Disk full' });
    });

    it('returns 400 when required fields are missing', async () => {
        const req = makeRequest('http://localhost/api/snapshots', {
            method: 'POST',
            body: JSON.stringify({ date: '2024-01-15' }),
            headers: { 'Content-Type': 'application/json' },
        });
        const response = await POST(req);

        expect(response.status).toBe(400);
    });
});

describe('DELETE /api/snapshots', () => {
    beforeEach(() => vi.clearAllMocks());

    it('deletes a snapshot by id and returns { deleted: true }', async () => {
        const mocks = makeMocks();
        mocks.delete.mockResolvedValue({ id: 'abc' });

        const req = makeRequest('http://localhost/api/snapshots?id=abc', {
            method: 'DELETE',
        });
        const response = await DELETE(req);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ deleted: true });
        expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 'abc' } });
    });

    it('returns 400 when id query param is missing', async () => {
        const req = makeRequest('http://localhost/api/snapshots', {
            method: 'DELETE',
        });
        const response = await DELETE(req);

        expect(response.status).toBe(400);
    });

    it('returns 404 when snapshot is not found (Prisma P2025)', async () => {
        const mocks = makeMocks();
        const notFoundError = Object.assign(new Error('Record not found'), { code: 'P2025' });
        mocks.delete.mockRejectedValue(notFoundError);

        const req = makeRequest('http://localhost/api/snapshots?id=nonexistent', {
            method: 'DELETE',
        });
        const response = await DELETE(req);
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body).toEqual({ error: 'Snapshot not found' });
    });

    it('returns HTTP 500 with error message on database failure', async () => {
        const mocks = makeMocks();
        mocks.delete.mockRejectedValue(new Error('Transaction failed'));

        const req = makeRequest('http://localhost/api/snapshots?id=abc', {
            method: 'DELETE',
        });
        const response = await DELETE(req);
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body).toEqual({ error: 'Transaction failed' });
    });
});
