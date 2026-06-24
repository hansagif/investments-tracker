/**
 * Wraps a Gemini API call with automatic retries for transient errors (503, 429).
 * Waits `delayMs * attempt` before each retry (linear backoff).
 */
export async function withGeminiRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    delayMs = 3000
): Promise<T> {
    let lastError: Error = new Error("Unknown error");
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err as Error;
            const msg = lastError.message;
            const isRetryable =
                msg.includes("503") ||
                msg.includes("429") ||
                msg.includes("Service Unavailable") ||
                msg.includes("Too Many Requests") ||
                msg.includes("high demand");
            if (!isRetryable || attempt === maxAttempts) throw err;
            await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        }
    }
    throw lastError;
}
