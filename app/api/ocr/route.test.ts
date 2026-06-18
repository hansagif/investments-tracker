/**
 * Unit tests for POST /api/ocr
 * Requirements: 2.1, 2.2, 2.3, 2.7
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockTesseractParse = vi.fn();
const mockGeminiParse = vi.fn();

vi.mock('@/lib/ocr/tesseract', () => ({
    TesseractBackend: vi.fn().mockImplementation(() => ({ parse: mockTesseractParse })),
}));
vi.mock('@/lib/ocr/gemini', () => ({
    GeminiBackend: vi.fn().mockImplementation(() => ({ parse: mockGeminiParse })),
}));

let mockConfig = { ocrBackend: 'tesseract', geminiApiToken: '' };

vi.mock('fs', () => ({
    default: { readFileSync: vi.fn((_p, _e) => JSON.stringify(mockConfig)) },
}));

import { POST } from './route';

const VALID_SIZE = 1024;

function makeMockFile(opts) {
    const { mimeType = 'image/png', sizeBytes = VALID_SIZE, fileName = 'screenshot.png' } = opts || {};
    const nb = Buffer.alloc(Math.min(sizeBytes, 64));
    return {
        name: fileName, type: mimeType, size: sizeBytes,
        arrayBuffer: () => Promise.resolve(nb.buffer.slice(nb.byteOffset, nb.byteOffset + nb.byteLength)),
        slice: () => new Blob(), stream: () => { throw new Error('na'); },
        text: () => Promise.resolve(''), lastModified: 0,
    };
}

function makeReq(opts) {
    const { fieldName = 'image', ...rest } = opts || {};
    const file = makeMockFile(rest);
    const fd = { get: (k) => (k === fieldName ? file : null) };
    const req = new NextRequest('http://localhost/api/ocr', { method: 'POST' });
    vi.spyOn(req, 'formData').mockResolvedValue(fd);
    return req;
}

function makeEmptyReq() {
    const fd = { get: () => null };
    const req = new NextRequest('http://localhost/api/ocr', { method: 'POST' });
    vi.spyOn(req, 'formData').mockResolvedValue(fd);
    return req;
}

beforeEach(() => { vi.clearAllMocks(); mockConfig = { ocrBackend: 'tesseract', geminiApiToken: '' }; });

describe('POST /api/ocr - input validation', () => {
    it('returns 400 when no image field is present', async () => {
        const res = await POST(makeEmptyReq());
        expect(res.status).toBe(400);
        expect(await res.json()).toHaveProperty('error');
    });
    it('returns 415 for image/gif', async () => {
        const res = await POST(makeReq({ mimeType: 'image/gif', fileName: 'a.gif' }));
        expect(res.status).toBe(415);
        expect((await res.json()).error).toMatch(/unsupported file type/i);
    });
    it('returns 415 for application/pdf', async () => {
        expect((await POST(makeReq({ mimeType: 'application/pdf', fileName: 'd.pdf' }))).status).toBe(415);
    });
    it('returns 413 when file size exceeds 10 MB', async () => {
        const res = await POST(makeReq({ sizeBytes: 10 * 1024 * 1024 + 1 }));
        expect(res.status).toBe(413);
        expect((await res.json()).error).toMatch(/10 mb/i);
    });
    it('accepts image/png', async () => {
        mockTesseractParse.mockResolvedValue({ totalTransactionValue: 100, freeFunds: 50, netProfitLoss: 5, errors: [] });
        const res = await POST(makeReq({ mimeType: 'image/png' }));
        expect(res.status).not.toBe(413); expect(res.status).not.toBe(415);
    });
    it('accepts image/jpeg', async () => {
        mockTesseractParse.mockResolvedValue({ totalTransactionValue: null, freeFunds: null, netProfitLoss: null, errors: [] });
        expect((await POST(makeReq({ mimeType: 'image/jpeg', fileName: 's.jpg' }))).status).not.toBe(415);
    });
    it('accepts image/webp', async () => {
        mockTesseractParse.mockResolvedValue({ totalTransactionValue: null, freeFunds: null, netProfitLoss: null, errors: [] });
        expect((await POST(makeReq({ mimeType: 'image/webp', fileName: 's.webp' }))).status).not.toBe(415);
    });
});

describe('POST /api/ocr - backend delegation', () => {
    const pr = { totalTransactionValue: 9823.45, freeFunds: 241.6, netProfitLoss: -12.3, errors: [] };
    it('delegates to TesseractBackend when ocrBackend is tesseract', async () => {
        mockTesseractParse.mockResolvedValue(pr);
        const res = await POST(makeReq({ mimeType: 'image/png' }));
        expect(res.status).toBe(200);
        expect(mockTesseractParse).toHaveBeenCalledOnce();
        expect(mockGeminiParse).not.toHaveBeenCalled();
        expect(await res.json()).toEqual(pr);
    });
    it('delegates to GeminiBackend when ocrBackend is gemini and token is set', async () => {
        mockConfig = { ocrBackend: 'gemini', geminiApiToken: 'tok' };
        mockGeminiParse.mockResolvedValue(pr);
        const res = await POST(makeReq({ mimeType: 'image/png' }));
        expect(res.status).toBe(200);
        expect(mockGeminiParse).toHaveBeenCalledOnce();
        expect(mockTesseractParse).not.toHaveBeenCalled();
        expect(await res.json()).toEqual(pr);
    });
    it('falls back to TesseractBackend when gemini token is empty', async () => {
        mockConfig = { ocrBackend: 'gemini', geminiApiToken: '' };
        mockTesseractParse.mockResolvedValue(pr);
        const res = await POST(makeReq({ mimeType: 'image/png' }));
        expect(res.status).toBe(200);
        expect(mockTesseractParse).toHaveBeenCalledOnce();
        expect(mockGeminiParse).not.toHaveBeenCalled();
    });
});

describe('POST /api/ocr - response shape', () => {
    it('returns full ParsedSnapshot including errors array', async () => {
        const result = { totalTransactionValue: null, freeFunds: 200, netProfitLoss: 0, errors: ['totalTransactionValue'] };
        mockTesseractParse.mockResolvedValue(result);
        const res = await POST(makeReq({ mimeType: 'image/png' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.totalTransactionValue).toBeNull();
        expect(body.freeFunds).toBe(200); expect(body.netProfitLoss).toBe(0);
        expect(body.errors).toContain('totalTransactionValue');
    });
});

describe('POST /api/ocr - error handling', () => {
    it('returns 500 when the OCR backend throws', async () => {
        mockTesseractParse.mockRejectedValue(new Error('Tesseract worker crashed'));
        const res = await POST(makeReq({ mimeType: 'image/png' }));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toMatch(/tesseract worker crashed/i);
    });
});
