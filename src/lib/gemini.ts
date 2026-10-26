import { GEMINI_API_BASE, GEMINI_MODELS } from '../config';
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
  /** Technical detail (HTTP status + API message) shown small under the friendly message. */
  constructor(
    public code: AiErrorCode,
    public detail?: string,
  ) {
    super(detail ?? code);
  }
}

export type AiInput = { text?: string; images?: Blob[] };

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

const MODEL_KEY = 'rn-model';

/** Models to try, starting with the one that worked last time. */
function modelOrder(): string[] {
  let last: string | null = null;
  try {
    last = localStorage.getItem(MODEL_KEY);
  } catch {
    // ignore
  }
  return last && GEMINI_MODELS.includes(last) ? [last, ...GEMINI_MODELS.filter((m) => m !== last)] : [...GEMINI_MODELS];
}

function rememberModel(model: string) {
  try {
    localStorage.setItem(MODEL_KEY, model);
  } catch {
    // ignore
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Outcome =
  | { kind: 'ok'; data: GeminiResponse }
  | { kind: 'next-model'; error: AiError } // this model can't serve us; another might
  | { kind: 'retry'; error: AiError } // temporary server trouble
  | { kind: 'fatal'; error: AiError };

/** Classifies an HTTP response from generateContent. */
export function classifyResponse(
  status: number,
  err: GeminiResponse['error'] | undefined,
): Exclude<Outcome, { kind: 'ok' }> | null {
  if (status >= 200 && status < 300) return null;
  const msg = `${err?.status ?? ''} ${err?.message ?? ''}`.trim();
  const detail = `HTTP ${status}${msg ? ` · ${msg.slice(0, 200)}` : ''}`;
  if (/API_KEY_INVALID|API key not valid|API key expired/i.test(msg) || status === 401) {
    return { kind: 'fatal', error: new AiError('bad-key', detail) };
  }
  // Free-tier quotas are per model, so another model may still have room.
  if (status === 429) return { kind: 'next-model', error: new AiError('quota', detail) };
  // Model retired, renamed, or not open to this key (e.g. 2.5 models for new users).
  if (status === 404 || status === 403) return { kind: 'next-model', error: new AiError(status === 403 ? 'bad-key' : 'server', detail) };
  if (status === 400 && /not found|not supported|no longer|unsupported model|is not available/i.test(msg)) {
    return { kind: 'next-model', error: new AiError('server', detail) };
  }
  if (status === 400 && /image|inline_?data|mime/i.test(msg)) return { kind: 'fatal', error: new AiError('unreadable', detail) };
  if (status >= 500) return { kind: 'retry', error: new AiError('server', detail) };
  return { kind: 'fatal', error: new AiError('server', detail) };
}

async function callModel(apiKey: string, model: string, body: unknown): Promise<Outcome> {
  if (!navigator.onLine) return { kind: 'fatal', error: new AiError('offline') };
  let res: Response;
  try {
    // Key goes in a header, not the URL, so it does not end up in logs or history.
    res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return navigator.onLine
      ? { kind: 'retry', error: new AiError('server', `network · ${e instanceof Error ? e.message : String(e)}`) }
      : { kind: 'fatal', error: new AiError('offline') };
  }
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  return classifyResponse(res.status, data.error) ?? { kind: 'ok', data };
}

/** Calls generateContent, falling back across models and retrying brief server errors. */
async function generate(apiKey: string, body: unknown): Promise<GeminiResponse> {
  let lastError = new AiError('server');
  for (const model of modelOrder()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await callModel(apiKey, model, body);
      if (out.kind === 'ok') {
        rememberModel(model);
        return out.data;
      }
      lastError = new AiError(out.error.code, `${model} · ${out.error.detail ?? ''}`);
      if (out.kind === 'fatal') throw lastError;
      if (out.kind === 'next-model') break;
      await wait(1500); // 'retry': overloaded or flaky, try the same model once more
    }
  }
  throw lastError;
}

function responseText(data: GeminiResponse): string {
  if (data.promptFeedback?.blockReason) throw new AiError('blocked', data.promptFeedback.blockReason);
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
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

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: geminiResponseSchema },
  };

  let lastReason: 'invalid' | 'not-recipe' | 'unreadable' = 'invalid';
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = responseText(await generate(apiKey.trim(), body));
    const result = parseAiResponse(text, newId, Date.now());
    if (result.ok) return result.recipe;
    lastReason = result.reason;
    // A clear "not a recipe" / "unreadable" answer will not improve on retry.
    if (result.reason !== 'invalid') break;
  }
  throw new AiError(lastReason);
}

/** Checks the key with a tiny real request, so it also proves a model is reachable. Returns the model used. */
export async function checkApiKey(apiKey: string): Promise<string> {
  if (!apiKey.trim()) throw new AiError('no-key');
  await generate(apiKey.trim(), { contents: [{ role: 'user', parts: [{ text: 'ענה במילה אחת: שלום' }] }] });
  return modelOrder()[0];
}
