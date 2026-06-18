import { NextResponse } from 'next/server';
import { fetchRates, BNRError } from '@/lib/bnr';

export async function GET() {
    try {
        const result = await fetchRates();
        return NextResponse.json({
            rates: {
                RON_USD: result.rates.RON_USD,
                RON_EUR: result.rates.RON_EUR,
                fetchedAt: result.rates.fetchedAt.toISOString(),
            },
            fromCache: result.fromCache,
            cacheAgeMinutes: result.cacheAgeMinutes,
        });
    } catch (error) {
        if (error instanceof BNRError) {
            return NextResponse.json(
                { error: error.message },
                { status: 503 }
            );
        }
        return NextResponse.json(
            { error: 'Failed to fetch exchange rates' },
            { status: 500 }
        );
    }
}
