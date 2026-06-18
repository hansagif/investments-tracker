/**
 * GET /api/ai-tips
 *
 * Generates 3 investment tips using Gemini based on:
 * - Current stock positions (tickers, values, P&L)
 * - Recent news headlines
 *
 * Returns: { tips: { type: "buy"|"watch"|"sell", ticker: string, reason: string }[] }
 */
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

export async function GET() {
    try {
        const configPath = path.join(process.cwd(), 'data', 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const apiToken: string = config.geminiApiToken || process.env.GEMINI_API_KEY || '';

        if (!apiToken) {
            return NextResponse.json({ error: 'Gemini API token not configured.' }, { status: 422 });
        }

        // Get current positions
        const assets = await prisma.asset.findMany({ orderBy: { currentValue: 'desc' } });

        // Get recent news (last 10 headlines)
        const recentNews = await prisma.newsCache.findMany({
            orderBy: { publishedAt: 'desc' },
            take: 10,
            select: { headline: true, source: true },
        });

        const totalPortfolioValue = assets.reduce((s, a) => s + a.currentValue, 0);

        const positionsSummary = assets.map(a => {
            const pnlPct = a.currentPrice > 0 && a.costBasis > 0
                ? ((a.currentPrice - a.costBasis) / a.costBasis * 100).toFixed(1)
                : '0.0';
            const portfolioWeight = totalPortfolioValue > 0
                ? ((a.currentValue / totalPortfolioValue) * 100).toFixed(1)
                : '0.0';
            return `${a.ticker} (${a.name}, ${a.sector}): current_value=$${a.currentValue.toFixed(2)}, portfolio_weight=${portfolioWeight}%, avg_buy_price=$${a.costBasis.toFixed(2)}, actual_stock_price=$${a.currentPrice.toFixed(2)}, P&L=${pnlPct}%`;
        }).join('\n');

        const newsSummary = recentNews.map(n => `- ${n.headline}`).join('\n');

        const prompt = `You are an expert AI Portfolio Manager and Financial Analyst specializing in Value Investing and Portfolio Rebalancing. Analyze the user's stock portfolio and provide exactly 3 actionable, cold, and calculated tips: one "buy" (Consider buying more), one "watch" (Watch closely), and one "sell" (Consider selling).

Strictly adhere to these professional money management rules:
1. NEVER recommend buying a stock just because it had a massive positive spike (Avoid FOMO/Momentum Bias). If a speculative asset is at its peak, suggest taking partial profits instead.
2. Prioritize "Buy the Dip" for mega-cap, fundamentally strong companies (e.g., Microsoft, Alphabet, Amazon). If a dominant giant is down, view it as a discount opportunity to lower the average cost base via dollar-cost averaging.
3. Monitor Portfolio Allocation (Position Sizing). Avoid recommending more buys on assets that already over-saturate the portfolio (if an asset is already >30% of total value, do not recommend buying more unless it drops past a critical historic discount).
4. Keep tips concise, analytical, and objective. Use professional financial terminology (e.g., "dollar-cost averaging", "valuation premium", "downside protection", "mean reversion").

Current portfolio (total value: $${totalPortfolioValue.toFixed(2)}):
${positionsSummary}

Recent market news:
${newsSummary || '(no recent news available)'}

Return ONLY a valid JSON array with exactly 3 items — one of each type:
[
  { "type": "buy", "ticker": "TICKER", "reason": "concise analytical reason using professional terminology" },
  { "type": "watch", "ticker": "TICKER", "reason": "concise analytical reason using professional terminology" },
  { "type": "sell", "ticker": "TICKER", "reason": "concise analytical reason using professional terminology" }
]

Rules:
- "type" must be exactly one of: "buy", "watch", "sell"
- "ticker" must be one of the tickers in the portfolio above
- "reason" must be 1-2 sentences, analytical and specific
- Apply the 4 rules above strictly
- Return ONLY the JSON array, no markdown, no explanation`;

        const genAI = new GoogleGenerativeAI(apiToken);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
        const result = await model.generateContent(prompt);
        const raw = result.response.text().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

        const tips = JSON.parse(raw);
        return NextResponse.json({ tips, generatedAt: new Date().toISOString() });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
