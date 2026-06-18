import type { Asset } from "@prisma/client";

const EXCHANGE_PENALTY = 0.005; // 0.5%

export interface ExchangeRates {
    RON_USD: number; // 1 USD → RON
    RON_EUR: number; // 1 EUR → RON
    fetchedAt: Date;
}

/**
 * Convert an amount in the given source currency to RON.
 *
 * - RON: returned unchanged (no penalty for same-currency amounts).
 * - USD: amount × RON_USD rate × (1 − 0.005)
 * - EUR: amount × RON_EUR rate × (1 − 0.005)
 */
export function toRON(
    amount: number,
    sourceCurrency: "USD" | "EUR" | "RON",
    rates: ExchangeRates
): number {
    if (sourceCurrency === "RON") {
        return amount;
    }

    if (sourceCurrency === "USD") {
        return amount * rates.RON_USD * (1 - EXCHANGE_PENALTY);
    }

    // EUR
    return amount * rates.RON_EUR * (1 - EXCHANGE_PENALTY);
}

/**
 * Sum all asset current values converted to RON.
 */
export function portfolioTotalRON(
    assets: Asset[],
    rates: ExchangeRates
): number {
    return assets.reduce((total, asset) => {
        const currency = asset.currency as "USD" | "EUR" | "RON";
        return total + toRON(asset.currentValue, currency, rates);
    }, 0);
}
