// Feature: ai-wealth-dashboard, Property 23: Responsive layout breakpoint
import { test, expect } from "vitest";
import * as fc from "fast-check";
import { getResponsiveLayoutClass } from "./layout";

/**
 * Property 23: Responsive layout breakpoint
 * Validates: Requirements 8.4
 *
 * For any viewport width strictly less than 768px, the dashboard SHALL apply the
 * mobile single-column layout CSS class (flex-col).
 * For any viewport width of exactly 768px or greater, the dashboard SHALL apply
 * the desktop layout CSS class (md:flex-row).
 */

test("Property 23: mobile layout class applied when width < 768", () => {
    fc.assert(
        fc.property(
            fc.integer({ min: 320, max: 767 }),
            (width) => {
                const cls = getResponsiveLayoutClass(width);
                // Mobile: flex-col class must be present
                expect(cls).toContain("flex-col");
                // Desktop class must NOT be selected
                expect(cls).not.toContain("md:flex-row");
            }
        ),
        { numRuns: 25 }
    );
});

test("Property 23: desktop layout class applied when width >= 768", () => {
    fc.assert(
        fc.property(
            fc.integer({ min: 768, max: 1920 }),
            (width) => {
                const cls = getResponsiveLayoutClass(width);
                // Desktop: md:flex-row class must be present
                expect(cls).toContain("md:flex-row");
                // Mobile-only class must NOT be selected
                expect(cls).not.toContain("flex-col");
            }
        ),
        { numRuns: 25 }
    );
});
