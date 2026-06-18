/**
 * Shared interfaces for the OCR_Engine subsystem.
 * Both TesseractBackend and GeminiBackend implement OCREngine and return ParsedSnapshot.
 */

export interface ParsedSnapshot {
    /** Total Transaction Value extracted from XTB screenshot, or null if extraction failed. */
    totalTransactionValue: number | null;
    /** Free Funds extracted from XTB screenshot, or null if extraction failed. */
    freeFunds: number | null;
    /** Net Profit/Loss extracted from XTB screenshot, or null if extraction failed. */
    netProfitLoss: number | null;
    /**
     * Field names that either failed extraction or were out of the valid range
     * (−1,000,000 ≤ value ≤ +1,000,000).
     */
    errors: string[];
    /**
     * Raw text as extracted by the OCR engine — always included so the UI can
     * display it for debugging and manual pattern calibration.
     */
    rawText?: string;
}

export interface OCREngine {
    /**
     * Parse an XTB closing screenshot and return the three key numeric fields.
     *
     * @param imageBuffer - Raw image bytes. Must be non-empty.
     * @param mimeType    - MIME type of the image (e.g. "image/png").
     * @throws Error if imageBuffer is empty or null.
     */
    parse(imageBuffer: Buffer, mimeType: string): Promise<ParsedSnapshot>;
}
