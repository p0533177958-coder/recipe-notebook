import { GEMINI_API_BASE, GEMINI_MODEL } from '../config';
import { newId } from '../db';
import type { Recipe } from '../types';
import { SYSTEM_PROMPT } from './aiPrompt';
import { geminiResponseSchema, parseAiResponse } from './aiRecipe';
import { blobToBase64 } from './image';

export type AiErrorCode =
  | 'no-key'
  | 'offline'
  | 'quota'
  | 'bad-key'
  | 'unreadable'
  | 'not-recipe'
  | 'invalid'
  | 'server'
  | 'blocked';

export class AiError extends Error {
  constructor(public code: AiErrorCode, detail?: string) {
    super(detail ?? code);
  }
}

export type AiInput = { text?: string; images?: Blob[] };

function errorFromStatus(status: number): AiError {
  if (status === 429) return new AiError('quota');
  if (status === 400 || status === 401 || status === 403) return new AiError('bad-key');
  return new AiError('server', String(status));
}

async function post(apiKey: string, body: unknown): Promise<Response> {
  if (!navigator.onLine) throw new AiError('offline');
  try {
    // Key goes in a header, not the URL, so it does not end up in logs or history.
    return await fetch(`${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError(navigator.onLine ? 'server' : 'offline');
  }
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

async function requestOnce(apiKey: string, parts: unknown[]): Promise<string> {
  const res = await post(apiKey, {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: geminiResponseSchema,
      temperature: 0.2,
    },
  });
  if (!res.ok) {
    // A 400 with an invalid key reads API_KEY_INVALID; other 400s are request problems.
    if (res.status === 400) {
      const err = (await res.json().catch(() => ({}))) as GeminiResponse;
      const msg = `${err.error?.message ?? ''} ${err.error?.status ?? ''}`;
      if (/api key|API_KEY/i.test(msg)) throw new AiError('bad-key');
      if (/image|inline_data|mime/i.test(msg)) throw new AiError('unreadable');
      throw new AiError('server', msg);
    }
    throw errorFromStatus(res.status);
  }
  const data = (await res.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) throw new AiError('blocked');
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return text;
}

/** Sends text and/or images to Gemini and returns a validated recipe. Retries once on a bad answer. */
export async function extractRecipe(apiKey: string, input: AiInput): Promise<Recipe> {
  if (!apiKey.trim()) throw new AiError('no-key');
  const parts: unknown[] = [];
  const images = input.images ?? [];
  if (images.length > 1) {
    parts.push({ text: `לפניך ${images.length} תמונות של אותו מתכון, לפי הסדר.` });
  }
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.type || 'image/jpeg', data: await blobToBase64(img) } });
  }
  if (input.text?.trim()) parts.push({ text: input.text.trim() });
  if (parts.length === 0) throw new AiError('not-recipe');

  let lastReason: 'invalid' | 'not-recipe' | 'unreadable' = 'invalid';
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await requestOnce(apiKey.trim(), parts);
    const result = parseAiResponse(text, newId, Date.now());
    if (result.ok) return result.recipe;
    lastReason = result.reason;
    // A clear "not a recipe" / "unreadable" answer will not improve on retry.
    if (result.reason !== 'invalid') break;
  }
  throw new AiError(lastReason);
}

/** Lightweight key check: fetches the model's metadata. */
export async function checkApiKey(apiKey: string): Promise<void> {
  if (!apiKey.trim()) throw new AiError('no-key');
  if (!navigator.onLine) throw new AiError('offline');
  let res: Response;
  try {
    res = await fetch(`${GEMINI_API_BASE}/models/${GEMINI_MODEL}`, {
      headers: { 'x-goog-api-key': apiKey.trim() },
    });
  } catch {
    throw new AiError('offline');
  }
  if (!res.ok) throw errorFromStatus(res.status);
}
