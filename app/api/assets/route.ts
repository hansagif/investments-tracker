import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { validateAssetInput } from '@/lib/assets';

const prisma = new PrismaClient();

// GET /api/assets — list all assets ordered by ticker
export async function GET() {
    try {
        const assets = await prisma.asset.findMany({
            orderBy: { ticker: 'asc' },
        });
        return NextResponse.json(assets);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown database error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/assets — create a new asset
// Body: AssetInput fields (ticker, name?, type, sector, currentValue, costBasis, currency)
// Returns 400 with { errors } on validation failure, 409 on duplicate ticker, 201 on success
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON body' },
            { status: 400 }
        );
    }

    // Build AssetInput from request body
    const raw = body as Record<string, unknown>;
    const input = {
        ticker: raw?.ticker,
        name: raw?.name,
        type: raw?.type,
        sector: raw?.sector,
        currentValue: raw?.currentValue,
        costBasis: raw?.costBasis,
        currency: raw?.currency,
    } as Parameters<typeof validateAssetInput>[0];

    // Validate all fields per Requirement 4.7
    const errors = validateAssetInput(input);
    if (Object.keys(errors).length > 0) {
        return NextResponse.json({ errors }, { status: 400 });
    }

    // Check for duplicate ticker — Requirement 4.8
    try {
        const existing = await prisma.asset.findUnique({
            where: { ticker: input.ticker },
        });
        if (existing) {
            return NextResponse.json(
                { error: 'Duplicate ticker' },
                { status: 409 }
            );
        }

        // Create the asset
        const asset = await prisma.asset.create({
            data: {
                ticker: input.ticker,
                name: typeof input.name === 'string' ? input.name : '',
                type: input.type,
                sector: input.sector,
                currentValue: input.currentValue,
                costBasis: input.costBasis,
                currency: input.currency,
            },
        });
        return NextResponse.json(asset, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown database error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// PATCH /api/assets?ticker=<ticker> — update an existing asset's values
export async function PATCH(request: NextRequest) {
    const ticker = request.nextUrl.searchParams.get('ticker');
    if (!ticker) {
        return NextResponse.json({ error: 'Missing required query parameter: ticker' }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const raw = body as Record<string, unknown>;

    try {
        const asset = await prisma.asset.update({
            where: { ticker },
            data: {
                ...(raw.name !== undefined && { name: String(raw.name) }),
                ...(raw.type !== undefined && { type: String(raw.type) }),
                ...(raw.sector !== undefined && { sector: String(raw.sector) }),
                ...(typeof raw.currentValue === 'number' && { currentValue: raw.currentValue }),
                ...(typeof raw.costBasis === 'number' && { costBasis: raw.costBasis }),
                ...(raw.currency !== undefined && { currency: String(raw.currency) }),
            },
        });
        return NextResponse.json(asset);
    } catch (error) {
        if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2025') {
            return NextResponse.json({ error: `Asset "${ticker}" not found` }, { status: 404 });
        }
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

// DELETE /api/assets?ticker=<ticker> — delete an asset by ticker
export async function DELETE(request: NextRequest) {
    const ticker = request.nextUrl.searchParams.get('ticker');

    if (!ticker) {
        return NextResponse.json(
            { error: 'Missing required query parameter: ticker' },
            { status: 400 }
        );
    }

    try {
        await prisma.asset.delete({ where: { ticker } });
        return NextResponse.json({ deleted: true }, { status: 200 });
    } catch (error) {
        // Prisma P2025: record not found
        if (
            error instanceof Error &&
            'code' in error &&
            (error as { code: string }).code === 'P2025'
        ) {
            return NextResponse.json(
                { error: `Asset with ticker "${ticker}" not found` },
                { status: 404 }
            );
        }
        const message = error instanceof Error ? error.message : 'Unknown database error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
