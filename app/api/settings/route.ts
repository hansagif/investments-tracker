import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface AppConfig {
  ocrBackend: 'tesseract' | 'gemini';
  geminiApiToken: string;
  watchlist: string[];
  newsFeeds: string[];
  simulationDefaults: Partial<{
    monthlyContribution: number;
    annualGrowthRate: number;
    horizonYears: number;
  }>;
}

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  ocrBackend: 'tesseract',
  geminiApiToken: '',
  watchlist: [],
  newsFeeds: ['https://feeds.finance.yahoo.com/rss/2.0/headline'],
  simulationDefaults: {
    monthlyContribution: 500,
    annualGrowthRate: 7,
    horizonYears: 5,
  },
};

function readConfig(): AppConfig {
  // Initialize with defaults if missing
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

export async function GET() {
  try {
    const config = readConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const config = readConfig();
    const updated = { ...config, ...body };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
