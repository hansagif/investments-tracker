/**
 * Simple append-only file logger for server-side API routes.
 * Writes to data/app.log — safe to tail -f for live debugging.
 */
import fs from "fs";
import path from "path";

const LOG_PATH = path.join(process.cwd(), "data", "app.log");

function ts() {
    return new Date().toISOString();
}

function write(level: string, tag: string, msg: string, data?: unknown) {
    const dataStr = data !== undefined ? " " + JSON.stringify(data) : "";
    const line = `[${ts()}] ${level} [${tag}] ${msg}${dataStr}\n`;
    try {
        fs.appendFileSync(LOG_PATH, line, "utf-8");
    } catch {
        // If data/ dir doesn't exist yet, create it then retry
        try {
            fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
            fs.appendFileSync(LOG_PATH, line, "utf-8");
        } catch { /* give up silently — never crash the app for logging */ }
    }
    // Also mirror to stdout so Next.js terminal shows it too
    console.log(line.trimEnd());
}

export const log = {
    info: (tag: string, msg: string, data?: unknown) => write("INFO ", tag, msg, data),
    warn: (tag: string, msg: string, data?: unknown) => write("WARN ", tag, msg, data),
    error: (tag: string, msg: string, data?: unknown) => write("ERROR", tag, msg, data),
};
