/**
 * Unit tests for DailyLog — drag-and-drop upload zone (Requirement 2.1)
 *
 * Covers:
 *  - Drop zone renders with correct UI elements
 *  - Accepted file types: PNG, JPG, JPEG, WEBP
 *  - Rejected file types show descriptive error
 *  - Oversized files (> 10 MB) show descriptive error
 *  - Valid files are acknowledged
 *  - Click to browse opens file input
 *  - Keyboard Enter/Space triggers file input
 *  - Drag-over visual state
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DailyLog } from "./DailyLog";

const MB = 1024 * 1024;

function makeFile(name: string, type: string, sizeBytes: number): File {
    const content = new Uint8Array(sizeBytes);
    return new File([content], name, { type });
}

describe("DailyLog upload zone", () => {
    beforeEach(() => {
        // jsdom does not implement click() on input[type=file]; stub it
        vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => { });
    });

    it("renders the drop zone with instructional text", () => {
        render(<DailyLog />);
        expect(
            screen.getByText(/drop your xtb screenshot here or/i)
        ).toBeInTheDocument();
        expect(screen.getByText(/png, jpg, jpeg, webp up to 10 mb/i)).toBeInTheDocument();
    });

    it("drop zone has accessible role and label", () => {
        render(<DailyLog />);
        const zone = screen.getByRole("button", {
            name: /upload xtb screenshot/i,
        });
        expect(zone).toBeInTheDocument();
    });

    // ── Valid file types ──────────────────────────────────────────────────────

    it.each([
        ["screenshot.png", "image/png"],
        ["screenshot.jpg", "image/jpg"],
        ["screenshot.jpeg", "image/jpeg"],
        ["screenshot.webp", "image/webp"],
    ])("accepts valid file type: %s", (_name, type) => {
        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");
        const file = makeFile(_name, type, 1 * MB);

        fireEvent.drop(zone, {
            dataTransfer: { files: [file] },
        });

        expect(screen.queryByTestId("upload-error")).not.toBeInTheDocument();
        expect(screen.getByTestId("accepted-file")).toHaveTextContent(_name);
    });

    // ── Invalid file type ─────────────────────────────────────────────────────

    it.each([
        ["document.pdf", "application/pdf"],
        ["archive.zip", "application/zip"],
        ["image.gif", "image/gif"],
        ["spreadsheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ])("rejects unsupported file type: %s", (_name, type) => {
        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");
        const file = makeFile(_name, type, 1 * MB);

        fireEvent.drop(zone, {
            dataTransfer: { files: [file] },
        });

        const errorEl = screen.getByTestId("upload-error");
        expect(errorEl).toHaveTextContent(
            "Unsupported file type. Please upload PNG, JPG, JPEG, or WEBP."
        );
        expect(screen.queryByTestId("accepted-file")).not.toBeInTheDocument();
    });

    // ── File size validation ──────────────────────────────────────────────────

    it("rejects a file that is exactly 1 byte over 10 MB", () => {
        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");
        const file = makeFile("big.png", "image/png", 10 * MB + 1);

        fireEvent.drop(zone, {
            dataTransfer: { files: [file] },
        });

        const errorEl = screen.getByTestId("upload-error");
        expect(errorEl).toHaveTextContent("File too large. Maximum size is 10 MB.");
        expect(screen.queryByTestId("accepted-file")).not.toBeInTheDocument();
    });

    it("accepts a file that is exactly 10 MB", () => {
        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");
        const file = makeFile("exact.png", "image/png", 10 * MB);

        fireEvent.drop(zone, {
            dataTransfer: { files: [file] },
        });

        expect(screen.queryByTestId("upload-error")).not.toBeInTheDocument();
        expect(screen.getByTestId("accepted-file")).toHaveTextContent("exact.png");
    });

    it("accepts a file that is just under 10 MB", () => {
        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");
        const file = makeFile("small.webp", "image/webp", 10 * MB - 1);

        fireEvent.drop(zone, {
            dataTransfer: { files: [file] },
        });

        expect(screen.queryByTestId("upload-error")).not.toBeInTheDocument();
        expect(screen.getByTestId("accepted-file")).toHaveTextContent("small.webp");
    });

    // ── Click to browse ───────────────────────────────────────────────────────

    it("clicking the drop zone triggers the hidden file input", async () => {
        const user = userEvent.setup();
        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");

        await user.click(zone);

        expect(HTMLInputElement.prototype.click).toHaveBeenCalledTimes(1);
    });

    // ── Keyboard accessibility ────────────────────────────────────────────────

    it("pressing Enter on the drop zone triggers the hidden file input", async () => {
        const user = userEvent.setup();
        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");
        zone.focus();

        await user.keyboard("{Enter}");

        expect(HTMLInputElement.prototype.click).toHaveBeenCalledTimes(1);
    });

    it("pressing Space on the drop zone triggers the hidden file input", async () => {
        const user = userEvent.setup();
        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");
        zone.focus();

        await user.keyboard("{ }");

        expect(HTMLInputElement.prototype.click).toHaveBeenCalledTimes(1);
    });

    // ── Drag visual state ─────────────────────────────────────────────────────

    it("sets data-dragging=true on dragover and false on dragleave", () => {
        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");

        fireEvent.dragOver(zone);
        expect(zone).toHaveAttribute("data-dragging", "true");

        fireEvent.dragLeave(zone);
        expect(zone).toHaveAttribute("data-dragging", "false");
    });

    // ── Previous error cleared on valid file ──────────────────────────────────

    it("clears previous error when a valid file is subsequently dropped", () => {
        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");

        // First drop an invalid file
        fireEvent.drop(zone, {
            dataTransfer: { files: [makeFile("bad.gif", "image/gif", 1 * MB)] },
        });
        expect(screen.getByTestId("upload-error")).toBeInTheDocument();

        // Then drop a valid file
        fireEvent.drop(zone, {
            dataTransfer: { files: [makeFile("good.png", "image/png", 1 * MB)] },
        });
        expect(screen.queryByTestId("upload-error")).not.toBeInTheDocument();
        expect(screen.getByTestId("accepted-file")).toHaveTextContent("good.png");
    });

    // ── File input onChange path ──────────────────────────────────────────────

    it("accepts a valid file via the file input onChange", () => {
        render(<DailyLog />);
        const input = screen.getByTestId("file-input");

        const file = makeFile("via-input.jpg", "image/jpeg", 2 * MB);
        fireEvent.change(input, { target: { files: [file] } });

        expect(screen.queryByTestId("upload-error")).not.toBeInTheDocument();
        expect(screen.getByTestId("accepted-file")).toHaveTextContent("via-input.jpg");
    });

    it("rejects an oversized file submitted via file input", () => {
        render(<DailyLog />);
        const input = screen.getByTestId("file-input");

        const file = makeFile("huge.png", "image/png", 11 * MB);
        fireEvent.change(input, { target: { files: [file] } });

        expect(screen.getByTestId("upload-error")).toHaveTextContent(
            "File too large. Maximum size is 10 MB."
        );
    });
});

// ─── CSV Import tests ─────────────────────────────────────────────────────────

describe("DailyLog CSV import", () => {
    beforeEach(() => {
        vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => { });
    });

    it("renders the Import Snapshots card with a 'Choose CSV file' button", () => {
        render(<DailyLog />);
        expect(screen.getByTestId("csv-import-button")).toHaveTextContent("Choose CSV file");
    });

    it("clicking the import button triggers the hidden CSV file input", async () => {
        const user = userEvent.setup();
        render(<DailyLog />);
        await user.click(screen.getByTestId("csv-import-button"));
        expect(HTMLInputElement.prototype.click).toHaveBeenCalled();
    });

    it("shows success result after a successful import", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ imported: 5, skipped: 1, errors: [] }),
        } as unknown as Response);

        render(<DailyLog />);
        const csvInput = screen.getByTestId("csv-file-input");
        const file = new File(["Date,Total,Free,Net,Currency\n2024-01-01,100,50,-5,USD"], "data.csv", { type: "text/csv" });
        // Provide text() method
        Object.defineProperty(file, "text", { value: async () => "Date,Total,Free,Net,Currency\n2024-01-01,100,50,-5,USD" });

        await fireEvent.change(csvInput, { target: { files: [file] } });

        // Wait for async state update
        await screen.findByTestId("import-result");
        expect(screen.getByTestId("import-result")).toHaveTextContent("Successfully imported 5 rows.");
        expect(screen.getByTestId("import-result")).toHaveTextContent("1 row skipped.");
    });

    it("shows error details toggle when errors are present", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                imported: 2,
                skipped: 1,
                errors: [{ row: 3, reason: "unparseable date" }],
            }),
        } as unknown as Response);

        render(<DailyLog />);
        const csvInput = screen.getByTestId("csv-file-input");
        const file = new File(["csv"], "data.csv", { type: "text/csv" });
        Object.defineProperty(file, "text", { value: async () => "csv" });

        await fireEvent.change(csvInput, { target: { files: [file] } });
        await screen.findByTestId("toggle-error-details");

        const toggle = screen.getByTestId("toggle-error-details");
        expect(toggle).toHaveTextContent("Show error details (1 row)");

        await userEvent.setup().click(toggle);
        const list = await screen.findByTestId("error-details-list");
        expect(list).toHaveTextContent("Row 3: unparseable date");
    });

    it("shows conflict dialog when API returns 409", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 409,
            json: async () => ({ conflict: true, conflictDates: ["2024-01-15"] }),
        } as unknown as Response);

        render(<DailyLog />);
        const csvInput = screen.getByTestId("csv-file-input");
        const file = new File(["csv"], "data.csv", { type: "text/csv" });
        Object.defineProperty(file, "text", { value: async () => "csv" });

        await fireEvent.change(csvInput, { target: { files: [file] } });
        await screen.findByTestId("conflict-dialog");

        expect(screen.getByTestId("conflict-dates-list")).toHaveTextContent("2024-01-15");
        expect(screen.getByTestId("overwrite-button")).toBeInTheDocument();
        expect(screen.getByTestId("skip-button")).toBeInTheDocument();
    });

    it("re-posts with force=true when user clicks Overwrite", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 409,
                json: async () => ({ conflict: true, conflictDates: ["2024-01-15"] }),
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ imported: 1, skipped: 0, errors: [] }),
            } as unknown as Response);

        global.fetch = fetchMock;

        render(<DailyLog />);
        const csvInput = screen.getByTestId("csv-file-input");
        const file = new File(["csv"], "data.csv", { type: "text/csv" });
        Object.defineProperty(file, "text", { value: async () => "csv" });

        await fireEvent.change(csvInput, { target: { files: [file] } });
        await screen.findByTestId("conflict-dialog");

        await userEvent.setup().click(screen.getByTestId("overwrite-button"));
        await screen.findByTestId("import-result");

        // Second call should include force=true in URL
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toContain("force=true");
    });

    it("dismisses conflict dialog when user clicks Cancel", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 409,
            json: async () => ({ conflict: true, conflictDates: ["2024-01-15"] }),
        } as unknown as Response);

        render(<DailyLog />);
        const csvInput = screen.getByTestId("csv-file-input");
        const file = new File(["csv"], "data.csv", { type: "text/csv" });
        Object.defineProperty(file, "text", { value: async () => "csv" });

        await fireEvent.change(csvInput, { target: { files: [file] } });
        await screen.findByTestId("conflict-dialog");

        await userEvent.setup().click(screen.getByTestId("skip-button"));

        expect(screen.queryByTestId("conflict-dialog")).not.toBeInTheDocument();
        expect(screen.queryByTestId("import-result")).not.toBeInTheDocument();
    });

    it("shows a network error message when fetch fails", async () => {
        global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

        render(<DailyLog />);
        const csvInput = screen.getByTestId("csv-file-input");
        const file = new File(["csv"], "data.csv", { type: "text/csv" });
        Object.defineProperty(file, "text", { value: async () => "csv" });

        await fireEvent.change(csvInput, { target: { files: [file] } });
        await screen.findByTestId("import-error");

        expect(screen.getByTestId("import-error")).toHaveTextContent(
            "Network error"
        );
    });
});

// ─── OCR review form tests ────────────────────────────────────────────────────

/**
 * Tests for task 15.2: OCR review form
 * Requirements: 2.3, 2.5, 2.8
 */

describe("DailyLog OCR review form", () => {
    beforeEach(() => {
        vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => { });
    });

    // ── Loading state ─────────────────────────────────────────────────────────

    it("shows 'Parsing screenshot…' while OCR is in progress", async () => {
        // Never-resolving fetch so we stay in loading state
        global.fetch = vi.fn().mockReturnValueOnce(new Promise(() => { }));

        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");
        const file = makeFile("screenshot.png", "image/png", 1 * MB);

        fireEvent.drop(zone, { dataTransfer: { files: [file] } });

        // Loading state appears immediately
        await screen.findByTestId("ocr-loading");
        expect(screen.getByTestId("ocr-loading")).toHaveTextContent("Parsing screenshot\u2026");
    });

    // ── Success: all fields parsed ────────────────────────────────────────────

    it("shows review form with pre-filled values after successful OCR", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                totalTransactionValue: 1234.56,
                freeFunds: 789.0,
                netProfitLoss: -42.5,
                errors: [],
            }),
        } as unknown as Response);

        render(<DailyLog />);
        const zone = screen.getByTestId("drop-zone");
        fireEvent.drop(zone, { dataTransfer: { files: [makeFile("s.png", "image/png", 1 * MB)] } });

        await screen.findByTestId("ocr-review-form");
        expect(screen.getByTestId("field-totalTransactionValue")).toHaveValue("1234.56");
        expect(screen.getByTestId("field-freeFunds")).toHaveValue("789");
        expect(screen.getByTestId("field-netProfitLoss")).toHaveValue("-42.5");
    });

    it("does not show flagging warnings when all fields are in range", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                totalTransactionValue: 500,
                freeFunds: 100,
                netProfitLoss: -10,
                errors: [],
            }),
        } as unknown as Response);

        render(<DailyLog />);
        fireEvent.drop(screen.getByTestId("drop-zone"), {
            dataTransfer: { files: [makeFile("s.png", "image/png", 1 * MB)] },
        });

        await screen.findByTestId("ocr-review-form");
        expect(screen.queryByTestId("field-totalTransactionValue-warning")).not.toBeInTheDocument();
        expect(screen.queryByTestId("field-freeFunds-warning")).not.toBeInTheDocument();
        expect(screen.queryByTestId("field-netProfitLoss-warning")).not.toBeInTheDocument();
    });

    // ── Out-of-range flagging (Requirement 2.8) ───────────────────────────────

    it("flags fields listed in the OCR errors array with warning message", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                totalTransactionValue: 2_000_000,
                freeFunds: 100,
                netProfitLoss: -50,
                errors: ["totalTransactionValue"],
            }),
        } as unknown as Response);

        render(<DailyLog />);
        fireEvent.drop(screen.getByTestId("drop-zone"), {
            dataTransfer: { files: [makeFile("s.png", "image/png", 1 * MB)] },
        });

        await screen.findByTestId("ocr-review-form");
        expect(screen.getByTestId("field-totalTransactionValue-warning")).toHaveTextContent(
            "Out-of-range value \u2014 please verify"
        );
        expect(screen.getByTestId("field-totalTransactionValue")).toHaveAttribute("aria-invalid", "true");
        expect(screen.queryByTestId("field-freeFunds-warning")).not.toBeInTheDocument();
    });

    it("shows extraction warning banner when any field has errors", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                totalTransactionValue: null,
                freeFunds: 100,
                netProfitLoss: -50,
                errors: ["totalTransactionValue"],
            }),
        } as unknown as Response);

        render(<DailyLog />);
        fireEvent.drop(screen.getByTestId("drop-zone"), {
            dataTransfer: { files: [makeFile("s.png", "image/png", 1 * MB)] },
        });

        await screen.findByTestId("ocr-extraction-warning");
        expect(screen.getByTestId("ocr-extraction-warning")).toBeInTheDocument();
    });

    // ── Null/failed fields (Requirement 2.5) ─────────────────────────────────

    it("pre-fills null fields as empty editable inputs", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                totalTransactionValue: null,
                freeFunds: null,
                netProfitLoss: null,
                errors: [],
            }),
        } as unknown as Response);

        render(<DailyLog />);
        fireEvent.drop(screen.getByTestId("drop-zone"), {
            dataTransfer: { files: [makeFile("s.png", "image/png", 1 * MB)] },
        });

        await screen.findByTestId("ocr-review-form");
        expect(screen.getByTestId("field-totalTransactionValue")).toHaveValue("");
        expect(screen.getByTestId("field-freeFunds")).toHaveValue("");
        expect(screen.getByTestId("field-netProfitLoss")).toHaveValue("");
    });

    // ── OCR failure paths (Requirement 2.5) ──────────────────────────────────

    it("shows error message and keeps form accessible when OCR fails with network error", async () => {
        global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network down"));

        render(<DailyLog />);
        fireEvent.drop(screen.getByTestId("drop-zone"), {
            dataTransfer: { files: [makeFile("s.png", "image/png", 1 * MB)] },
        });

        await screen.findByTestId("ocr-review-form");
        await screen.findByTestId("ocr-error");
        expect(screen.getByTestId("ocr-error")).toHaveTextContent("Network error");
        expect(screen.getByTestId("field-totalTransactionValue")).toBeInTheDocument();
        expect(screen.getByTestId("field-freeFunds")).toBeInTheDocument();
        expect(screen.getByTestId("field-netProfitLoss")).toBeInTheDocument();
    });

    it("shows error message and keeps form accessible when OCR returns HTTP error", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({ error: "Tesseract crashed" }),
        } as unknown as Response);

        render(<DailyLog />);
        fireEvent.drop(screen.getByTestId("drop-zone"), {
            dataTransfer: { files: [makeFile("s.png", "image/png", 1 * MB)] },
        });

        await screen.findByTestId("ocr-review-form");
        await screen.findByTestId("ocr-error");
        expect(screen.getByTestId("ocr-error")).toHaveTextContent("Tesseract crashed");
        expect(screen.getByTestId("field-totalTransactionValue")).toBeInTheDocument();
    });

    // ── User can edit fields (Requirement 2.3) ────────────────────────────────

    it("allows user to edit pre-filled fields", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                totalTransactionValue: 500,
                freeFunds: 200,
                netProfitLoss: -10,
                errors: [],
            }),
        } as unknown as Response);

        const user = userEvent.setup();
        render(<DailyLog />);
        fireEvent.drop(screen.getByTestId("drop-zone"), {
            dataTransfer: { files: [makeFile("s.png", "image/png", 1 * MB)] },
        });

        await screen.findByTestId("ocr-review-form");
        const ttv = screen.getByTestId("field-totalTransactionValue");

        await user.clear(ttv);
        await user.type(ttv, "999");

        expect(ttv).toHaveValue("999");
    });
});

// ─── Snapshot confirm actions tests ──────────────────────────────────────────

/**
 * Tests for task 15.4: Snapshot confirm, overwrite prompt, and retry-on-error
 * Requirements: 2.4, 2.6
 */

describe("DailyLog snapshot confirm actions", () => {
    beforeEach(() => {
        vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => { });
    });

    /**
     * Helper: render with OCR success so the review form and confirm button are visible.
     * Returns the fetch mock so callers can chain additional mock implementations.
     */
    async function renderWithOcrSuccess(fetchImpl?: ReturnType<typeof vi.fn>) {
        const fetchMock = fetchImpl ?? vi.fn();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                totalTransactionValue: 500,
                freeFunds: 200,
                netProfitLoss: -10,
                errors: [],
            }),
        } as unknown as Response);
        global.fetch = fetchMock;

        render(<DailyLog />);
        fireEvent.drop(screen.getByTestId("drop-zone"), {
            dataTransfer: { files: [makeFile("s.png", "image/png", 1 * MB)] },
        });

        await screen.findByTestId("ocr-review-form");
        return fetchMock;
    }

    // ── Overwrite prompt (Requirement 2.6) ────────────────────────────────────

    it("shows snapshot conflict dialog when POST /api/snapshots returns 409", async () => {
        const fetchMock = await renderWithOcrSuccess();
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 409,
            json: async () => ({}),
        } as unknown as Response);

        await userEvent.setup().click(screen.getByTestId("confirm-snapshot-button"));

        await screen.findByTestId("snapshot-conflict-dialog");
        expect(screen.getByTestId("snapshot-conflict-dialog")).toBeInTheDocument();
        expect(screen.getByTestId("snapshot-overwrite-button")).toBeInTheDocument();
        expect(screen.getByTestId("snapshot-cancel-overwrite-button")).toBeInTheDocument();
    });

    it("dismisses conflict dialog and restores review form when user clicks Cancel", async () => {
        const fetchMock = await renderWithOcrSuccess();
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 409,
            json: async () => ({}),
        } as unknown as Response);

        const user = userEvent.setup();
        await user.click(screen.getByTestId("confirm-snapshot-button"));
        await screen.findByTestId("snapshot-conflict-dialog");

        await user.click(screen.getByTestId("snapshot-cancel-overwrite-button"));

        // Dialog is gone, form fields still present
        expect(screen.queryByTestId("snapshot-conflict-dialog")).not.toBeInTheDocument();
        expect(screen.getByTestId("ocr-review-form")).toBeInTheDocument();
        expect(screen.getByTestId("field-totalTransactionValue")).toBeInTheDocument();
    });

    it("re-posts with ?force=true and clears the form when user confirms overwrite", async () => {
        const fetchMock = await renderWithOcrSuccess();
        // Snapshot POST → 409 conflict
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 409,
            json: async () => ({}),
        } as unknown as Response);
        // Overwrite POST → 200 success
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({}),
        } as unknown as Response);

        const user = userEvent.setup();
        await user.click(screen.getByTestId("confirm-snapshot-button"));
        await screen.findByTestId("snapshot-conflict-dialog");

        await user.click(screen.getByTestId("snapshot-overwrite-button"));

        // Second fetch should use ?force=true
        expect(fetchMock.mock.calls[2][0]).toContain("force=true");
        // On success the component clears ocrState to idle, hiding the review form
        await waitFor(() =>
            expect(screen.queryByTestId("ocr-review-form")).not.toBeInTheDocument()
        );
    });

    // ── Retry on error (Requirement 2.4) ─────────────────────────────────────

    it("shows error message but keeps form and confirm button available when POST returns 500", async () => {
        const fetchMock = await renderWithOcrSuccess();
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({ error: "Database unavailable" }),
        } as unknown as Response);

        await userEvent.setup().click(screen.getByTestId("confirm-snapshot-button"));

        await screen.findByTestId("snapshot-error");
        expect(screen.getByTestId("snapshot-error")).toHaveTextContent("Database unavailable");

        // Form fields must still be in the document (form retained)
        expect(screen.getByTestId("ocr-review-form")).toBeInTheDocument();
        expect(screen.getByTestId("field-totalTransactionValue")).toBeInTheDocument();
        expect(screen.getByTestId("field-freeFunds")).toBeInTheDocument();
        expect(screen.getByTestId("field-netProfitLoss")).toBeInTheDocument();

        // Confirm button must still be available for retry
        expect(screen.getByTestId("confirm-snapshot-button")).toBeInTheDocument();
        expect(screen.getByTestId("confirm-snapshot-button")).not.toBeDisabled();
    });

    it("allows retry after a 500 error — second confirm succeeds and clears the form", async () => {
        const fetchMock = await renderWithOcrSuccess();
        // First attempt → 500
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({ error: "Transient failure" }),
        } as unknown as Response);
        // Second attempt → 201 success
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 201,
            json: async () => ({}),
        } as unknown as Response);

        const user = userEvent.setup();

        // First click → error
        await user.click(screen.getByTestId("confirm-snapshot-button"));
        await screen.findByTestId("snapshot-error");

        // Second click → success: form cleared
        await user.click(screen.getByTestId("confirm-snapshot-button"));
        await waitFor(() =>
            expect(screen.queryByTestId("ocr-review-form")).not.toBeInTheDocument()
        );
    });
});

// ─── isOutOfRange unit tests ──────────────────────────────────────────────────

import { isOutOfRange } from "./DailyLog";

describe("isOutOfRange", () => {
    it("returns false for empty string", () => {
        expect(isOutOfRange("")).toBe(false);
    });

    it("returns false for value within range", () => {
        expect(isOutOfRange("500000")).toBe(false);
        expect(isOutOfRange("-999999")).toBe(false);
        expect(isOutOfRange("1000000")).toBe(false);
        expect(isOutOfRange("-1000000")).toBe(false);
    });

    it("returns true for value strictly greater than 1,000,000", () => {
        expect(isOutOfRange("1000001")).toBe(true);
        expect(isOutOfRange("2000000")).toBe(true);
    });

    it("returns true for value strictly less than -1,000,000", () => {
        expect(isOutOfRange("-1000001")).toBe(true);
    });

    it("returns false for non-numeric string", () => {
        expect(isOutOfRange("abc")).toBe(false);
    });
});
