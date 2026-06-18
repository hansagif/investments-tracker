// Feature: ai-wealth-dashboard, Property 14: Article rendering completeness

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import { ArticleCard } from '@/app/components/tabs/News';

/**
 * Arbitrary that generates NewsArticle-shaped objects as consumed by ArticleCard.
 * publishedAt is a serialised ISO string (as sent over the wire from /api/news).
 * relevanceTags has minLength: 1 so at least one tag is always present.
 */
const articleArbitrary = fc.record({
    id: fc.uuid(),
    headline: fc
        .string({ minLength: 1, maxLength: 120 })
        .filter((s) => s.trim().length > 0),
    source: fc
        .string({ minLength: 1, maxLength: 60 })
        .filter((s) => s.trim().length > 0),
    publishedAt: fc
        .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
        .map((d) => d.toISOString()),
    url: fc.webUrl(),
    relevanceTags: fc.array(
        fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0),
        { minLength: 1, maxLength: 5 }
    ),
    score: fc.float({ min: 0, max: 100 }),
});

describe('News ArticleCard rendering property tests', () => {
    /**
     * Property 14: Article rendering completeness
     * Validates: Requirements 5.7
     *
     * For any NewsArticle object, the rendered ArticleCard SHALL include a
     * non-empty headline, source, publication timestamp, and at least one
     * relevance tag in the DOM.
     */
    test('Property 14: Article rendering completeness', { timeout: 15000 }, () => {
        fc.assert(
            fc.property(articleArbitrary, (article) => {
                const { unmount, container } = render(
                    <ArticleCard article={article} />
                );

                // Headline — rendered as a link; text must be non-empty and match
                const headlineLink = screen.getByRole('link');
                expect(headlineLink.textContent?.trim()).toBeTruthy();
                expect(headlineLink.textContent?.trim()).toBe(article.headline.trim());

                // Source — span with font-medium class inside the muted row
                const sourceEl = container.querySelector(
                    '.text-muted-foreground .font-medium'
                );
                expect(sourceEl).not.toBeNull();
                expect(sourceEl!.textContent?.trim()).toBe(article.source.trim());

                // Timestamp — rendered inside a <time> element; must be non-empty
                const timeEl = container.querySelector('time');
                expect(timeEl).not.toBeNull();
                expect(timeEl!.textContent?.trim()).toBeTruthy();

                // At least one relevance tag — spans inside the tags container
                const tagContainer = container.querySelector(
                    '[aria-label="Relevance tags"]'
                );
                expect(tagContainer).not.toBeNull();
                const tagSpans = tagContainer!.querySelectorAll('span');
                expect(tagSpans.length).toBeGreaterThanOrEqual(1);
                tagSpans.forEach((tag) => {
                    expect(tag.textContent?.trim()).toBeTruthy();
                });

                unmount();
            }),
            { numRuns: 20 }
        );
    });
});
