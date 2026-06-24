import { NextRequest, NextResponse } from 'next/server';
import { GeminiBackend } from '@/lib/ocr/gemini';
import fs from 'fs';
import path from 'path';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp'];

export async function POST(request: NextRequest) {
    // Parse multipart/form-data
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
        return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
            { error: `Unsupported file type: ${file.type}. Allowed: PNG, JPG, JPEG, WEBP` },
            { status: 415 }
        );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'File size exceeds 10 MB limit' }, { status: 413 });
    }

    // Read config to determine active OCR backend
    const configPath = path.join(process.cwd(), 'data', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // Convert file to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!config.geminiApiToken) {
        return NextResponse.json(
            { error: 'Gemini API token is not configured. Add it in Settings.' },
            { status: 503 }
        );
    }

    const backend = new GeminiBackend(config.geminiApiToken);

    try {
        const result = await backend.parse(buffer, file.type);
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
