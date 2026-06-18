/**
 * Asset helpers — Portfolio_Manager utility functions.
 *
 * Pure functions used by the Allocation tab and the /api/assets route handler.
 * The Asset type is sourced from the Prisma-generated client.
 */

import type { Asset } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Valid instrument types. */
export type AssetType = "Stock" | "ETF";

/** Valid sector taxonomy values — expanded to cover common stock categories. */
export type AssetSector =
    | "Technology"
    | "Semiconductor"
    | "Software"
    | "AI & Robotics"
    | "Healthcare"
    | "Biotech"
    | "Finance"
    | "Energy"
    | "Consumer"
    | "Industrial"
    | "Aerospace & Defense"
    | "Real Estate"
    | "Other";

/** Valid currency codes. */
export type AssetCurrency = "USD" | "EUR" | "RON";

/** Input shape for creating/updating an asset position. */
export interface AssetInput {
    ticker: string;
    name?: string;
    type: string;
    sector: string;
    currentValue: number;
    costBasis: number;
    currency: string;
}

/** Field-level validation error map returned by validateAssetInput. */
export type AssetValidationErrors = Partial<Record<keyof AssetInput, string>>;

/** Position status thresholds (Requirements 4.5, 4.6). */
export interface PositionStatus {
    /** true when currentValue >= $8.00 (80 % of Position_Limit). */
    warning: boolean;
    /** true when currentValue >= $10.00 (Position_Limit reached). */
    locked: boolean;
}

/** A single asset's weight within the portfolio (Requirement 4.4). */
export interface AssetWeight {
    ticker: string;
    /** Percentage weight in the range [0, 100]. */
    weight: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const VALID_TYPES = ["Stock", "ETF"] as const satisfies readonly AssetType[];

export const VALID_SECTORS = [
    "Technology",
    "Semiconductor",
    "Software",
    "AI & Robotics",
    "Healthcare",
    "Biotech",
    "Finance",
    "Energy",
    "Consumer",
    "Industrial",
    "Aerospace & Defense",
    "Real Estate",
    "Other",
] as const satisfies readonly AssetSector[];

export const VALID_CURRENCIES = ["USD", "EUR", "RON"] as const satisfies readonly AssetCurrency[];

const VALID_TYPES_SET: ReadonlySet<string> = new Set(VALID_TYPES);
const VALID_SECTORS_SET: ReadonlySet<string> = new Set(VALID_SECTORS);
const VALID_CURRENCIES_SET: ReadonlySet<string> = new Set(VALID_CURRENCIES);

const TICKER_PATTERN = /^[A-Z0-9]{1,10}$/;

const WARNING_THRESHOLD = 8;
const LOCK_THRESHOLD = 10;

// ─── validateAssetInput (task 10.1) ───────────────────────────────────────────

/**
 * Validate an AssetInput against all field constraints from Requirement 4.7.
 *
 * Returns a map of field names to human-readable error strings.  An empty map
 * means the input is valid.
 *
 * @param input            Raw asset input to validate.
 * @param existingTickers  Optional set of already-registered ticker symbols.
 *                         When provided, a ticker that already exists in the
 *                         set will be reported as a duplicate (Requirement 4.8).
 */
export function validateAssetInput(
    input: AssetInput,
    existingTickers?: ReadonlySet<string>,
): AssetValidationErrors {
    const errors: AssetValidationErrors = {};

    if (!TICKER_PATTERN.test(input.ticker)) {
        errors.ticker =
            "Ticker must be 1–10 uppercase alphanumeric characters.";
    } else if (existingTickers?.has(input.ticker)) {
        errors.ticker = `Ticker "${input.ticker}" already exists in the portfolio.`;
    }

    if (!VALID_TYPES_SET.has(input.type)) {
        errors.type = 'Type must be one of "Stock" or "ETF".';
    }

    if (!VALID_SECTORS_SET.has(input.sector)) {
        errors.sector =
            "Sector must be one of the valid taxonomy values.";
    }

    if (typeof input.currentValue !== "number" || !isFinite(input.currentValue) || input.currentValue <= 0) {
        errors.currentValue = "Current value must be a positive number.";
    }

    if (typeof input.costBasis !== "number" || !isFinite(input.costBasis) || input.costBasis <= 0) {
        errors.costBasis = "Cost basis must be a positive number.";
    }

    if (!VALID_CURRENCIES_SET.has(input.currency)) {
        errors.currency = 'Currency must be one of "USD", "EUR", or "RON".';
    }

    return errors;
}

// ─── getPositionStatus (task 10.4) ────────────────────────────────────────────

/**
 * Determine the warning/locked status for an asset position.
 *
 * - warning: true when value >= $8.00 (80 % of the $10.00 Position_Limit)
 * - locked:  true when value >= $10.00 (Position_Limit reached)
 *
 * @param value  The asset's current value in its native currency (USD assumed).
 *
 * Requirements: 4.5, 4.6
 */
export function getPositionStatus(value: number): PositionStatus {
    return {
        warning: value >= WARNING_THRESHOLD,
        locked: value >= LOCK_THRESHOLD,
    };
}

// ─── calculatePositionWeights (task 10.6) ─────────────────────────────────────

/**
 * Calculate each asset's percentage weight within the portfolio.
 *
 * Weight formula: (asset.currentValue / totalValue) * 100
 *
 * - Returns an empty array when the assets array is empty.
 * - The weights of all returned entries sum to 100 (within floating-point
 *   tolerance) whenever the total portfolio value is greater than zero.
 *
 * @param assets  Array of Asset records from the Prisma client.
 *
 * Requirements: 4.4
 */
export function calculatePositionWeights(assets: Asset[]): AssetWeight[] {
    if (assets.length === 0) {
        return [];
    }

    const totalValue = assets.reduce(
        (sum, asset) => sum + asset.currentValue,
        0
    );

    if (totalValue === 0) {
        // All assets have zero value — return zero weights to avoid division by zero.
        return assets.map((asset) => ({ ticker: asset.ticker, weight: 0 }));
    }

    return assets.map((asset) => ({
        ticker: asset.ticker,
        weight: (asset.currentValue / totalValue) * 100,
    }));
}
