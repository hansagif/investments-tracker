/**
 * Responsive layout utilities for the AI Wealth Dashboard.
 *
 * Encodes the breakpoint logic described in Requirement 8.4:
 *  - Viewports strictly narrower than 768px → mobile single-column layout (flex-col)
 *  - Viewports at 768px or wider → desktop horizontal layout (md:flex-row)
 *
 * The Tailwind `md:` prefix corresponds to a min-width of 768px.
 * These pure functions make the breakpoint logic directly testable without
 * relying on CSS media query execution in jsdom.
 */

/** The CSS breakpoint (in pixels) at which the desktop layout is applied. */
export const DESKTOP_BREAKPOINT = 768;

/**
 * Returns the CSS class string for the TabsList layout based on the given
 * viewport width.
 *
 * - width < 768:  "flex-col"   (mobile — vertical stack)
 * - width >= 768: "md:flex-row" (desktop — horizontal bar)
 *
 * This mirrors the Tailwind responsive classes applied in TabShell.tsx:
 * `flex-col` for mobile and `md:flex-row` for desktop (≥ 768px breakpoint).
 */
export function getResponsiveLayoutClass(width: number): string {
    if (width < DESKTOP_BREAKPOINT) {
        return "flex-col";
    }
    return "md:flex-row";
}
