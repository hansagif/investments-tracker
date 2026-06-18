/**
 * Unit tests for Settings page (Requirement 7.7)
 *
 * Covers:
 *  1. Settings load on mount: GET /api/settings → form fields populated with returned values
 *  2. OCR backend selector: changing to "gemini" shows the Gemini API token input
 *  3. Gemini token field hidden when "tesseract" is selected
 *  4. News feed URL: "Add" button adds a URL to the list
 *  5. Remove a URL from the list
 *  6. Form save: clicking "Save Settings" calls PUT /api/settings with correct body
 *  7. Success message: "Settings saved" shown after successful PUT
 *  8. Error message: shown after failed PUT
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import SettingsPage from "./page";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    ocrBackend: "tesseract" as const,
    geminiApiToken: "",
    watchlist: [],
    newsFeeds: ["https://feeds.finance.yahoo.com/rss/2.0/headline"],
    simulationDefaults: {
        monthlyContribution: 500,
        annualGrowthRate: 7,
        horizonYears: 5,
    },
};

function mockGetSettings(overrides: Partial<typeof DEFAULT_SETTINGS> = {}) {
    return {
        ok: true,
        status: 200,
        json: async () => ({ ...DEFAULT_SETTINGS, ...overrides }),
    } as Response;
}

function mockPutSuccess(body?: Partial<typeof DEFAULT_SETTINGS>) {
    return {
        ok: true,
        status: 200,
        json: async () => ({ ...DEFAULT_SETTINGS, ...body }),
    } as Response;
}

function mockPutFailure(errorMsg = "Save failed") {
    return {
        ok: false,
        status: 500,
        json: async () => ({ error: errorMsg }),
    } as Response;
}

// Wait for loading to finish (the loading state shows "Loading settings…")
async function waitForLoaded() {
    await waitFor(() =>
        expect(screen.queryByText(/loading settings/i)).not.toBeInTheDocument()
    );
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("SettingsPage", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // 1. Settings load on mount ─────────────────────────────────────────────

    it("populates form fields with values returned from GET /api/settings", async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            ocrBackend: "gemini" as const,
            geminiApiToken: "test-token-123",
            newsFeeds: ["https://custom.example.com/rss"],
            simulationDefaults: {
                monthlyContribution: 1000,
                annualGrowthRate: 8,
                horizonYears: 10,
            },
        };

        global.fetch = vi.fn().mockResolvedValueOnce(mockGetSettings(settings));

        render(<SettingsPage />);
        await waitForLoaded();

        // OCR backend radio is set to gemini
        expect(screen.getByDisplayValue("gemini")).toBeChecked();

        // Gemini token field is present (since ocrBackend=gemini)
        const tokenInput = screen.getByLabelText(/gemini api token/i);
        expect(tokenInput).toHaveValue("test-token-123");

        // News feed URL is listed
        expect(screen.getByText("https://custom.example.com/rss")).toBeInTheDocument();

        // Simulation defaults
        expect(screen.getByLabelText(/monthly contribution/i)).toHaveValue(1000);
        expect(screen.getByLabelText(/annual growth rate/i)).toHaveValue(8);
        expect(screen.getByLabelText(/horizon/i)).toHaveValue(10);
    });

    it("shows loading indicator while fetching settings", () => {
        // fetch never resolves
        global.fetch = vi.fn().mockReturnValue(new Promise(() => { }));

        render(<SettingsPage />);
        expect(screen.getByText(/loading settings/i)).toBeInTheDocument();
    });

    // 2. OCR backend selector: switching to Gemini shows token input ─────────

    it("shows the Gemini API Token input when the Gemini radio is selected", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce(mockGetSettings());

        const user = userEvent.setup();
        render(<SettingsPage />);
        await waitForLoaded();

        // Initially on tesseract – token field not shown
        expect(screen.queryByLabelText(/gemini api token/i)).not.toBeInTheDocument();

        // Switch to gemini
        await user.click(screen.getByDisplayValue("gemini"));
        expect(screen.getByLabelText(/gemini api token/i)).toBeInTheDocument();
    });

    // 3. Gemini token field hidden when "tesseract" is selected ───────────────

    it("hides the Gemini API Token input when Tesseract is selected", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce(
            mockGetSettings({ ocrBackend: "gemini", geminiApiToken: "abc" })
        );

        const user = userEvent.setup();
        render(<SettingsPage />);
        await waitForLoaded();

        // Initially on gemini – token field visible
        expect(screen.getByLabelText(/gemini api token/i)).toBeInTheDocument();

        // Switch back to tesseract
        await user.click(screen.getByDisplayValue("tesseract"));
        expect(screen.queryByLabelText(/gemini api token/i)).not.toBeInTheDocument();
    });

    // 4. News feed URL: Add button adds a URL to the list ─────────────────────

    it("adds a new news feed URL to the list when the Add button is clicked", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce(
            mockGetSettings({ newsFeeds: [] })
        );

        const user = userEvent.setup();
        render(<SettingsPage />);
        await waitForLoaded();

        const urlInput = screen.getByLabelText(/new news feed url/i);
        await user.type(urlInput, "https://example.com/rss");
        await user.click(screen.getByRole("button", { name: /^add$/i }));

        expect(screen.getByText("https://example.com/rss")).toBeInTheDocument();
        // Input cleared after add
        expect(urlInput).toHaveValue("");
    });

    // 5. Remove a URL from the list ───────────────────────────────────────────

    it("removes a news feed URL from the list when the Remove button is clicked", async () => {
        const feedUrl = "https://feeds.finance.yahoo.com/rss/2.0/headline";
        global.fetch = vi.fn().mockResolvedValueOnce(
            mockGetSettings({ newsFeeds: [feedUrl] })
        );

        const user = userEvent.setup();
        render(<SettingsPage />);
        await waitForLoaded();

        expect(screen.getByText(feedUrl)).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: new RegExp(`remove ${feedUrl}`, "i") }));

        expect(screen.queryByText(feedUrl)).not.toBeInTheDocument();
    });

    // 6. Form save: PUT /api/settings called with the correct body ─────────────

    it("calls PUT /api/settings with the current config when Save Settings is clicked", async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            ocrBackend: "tesseract" as const,
            newsFeeds: ["https://example.com/rss"],
        };

        const fetchMock = vi.fn()
            .mockResolvedValueOnce(mockGetSettings(settings))  // GET
            .mockResolvedValueOnce(mockPutSuccess());           // PUT

        global.fetch = fetchMock;

        const user = userEvent.setup();
        render(<SettingsPage />);
        await waitForLoaded();

        await user.click(screen.getByRole("button", { name: /save settings/i }));

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/settings",
                expect.objectContaining({
                    method: "PUT",
                    headers: expect.objectContaining({ "Content-Type": "application/json" }),
                    body: expect.any(String),
                })
            )
        );

        // Verify body contains expected fields
        const putCall = fetchMock.mock.calls[1];
        const body = JSON.parse(putCall[1].body as string);
        expect(body.ocrBackend).toBe("tesseract");
        expect(body.newsFeeds).toEqual(["https://example.com/rss"]);
    });

    // 7. Success message after successful PUT ─────────────────────────────────

    it("shows 'Settings saved' after a successful PUT", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce(mockGetSettings())
            .mockResolvedValueOnce(mockPutSuccess());

        const user = userEvent.setup();
        render(<SettingsPage />);
        await waitForLoaded();

        await user.click(screen.getByRole("button", { name: /save settings/i }));

        await screen.findByRole("status");
        expect(screen.getByRole("status")).toHaveTextContent("Settings saved");
    });

    // 8. Error message after failed PUT ───────────────────────────────────────

    it("shows an error message after a failed PUT", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce(mockGetSettings())
            .mockResolvedValueOnce(mockPutFailure("Disk write error"));

        const user = userEvent.setup();
        render(<SettingsPage />);
        await waitForLoaded();

        await user.click(screen.getByRole("button", { name: /save settings/i }));

        await screen.findByRole("alert");
        expect(screen.getByRole("alert")).toHaveTextContent("Disk write error");
    });

    it("shows an error message when the GET /api/settings call fails", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({}),
        } as Response);

        render(<SettingsPage />);

        await screen.findByRole("alert");
        expect(screen.getByRole("alert")).toHaveTextContent(/failed to load settings/i);
    });
});
