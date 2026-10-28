import { GEMINI_API_BASE, GEMINI_MODELS } from '../config';
import { newId } from '../db';
import type { Recipe } from '../types';
import { SYSTEM_PROMPT } from './aiPrompt';
import type { AiEvent } from './aiProgress';
import { geminiResponseSchema, parseAiResponse, type AiDishBox } from './aiRecipe';
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

export type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
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

type Failure =
  | { kind: 'next-model'; error: AiError } // this model can't serve us; another might
  | { kind: 'retry'; error: AiError } // temporary server trouble
  | { kind: 'fatal'; error: AiError };

type Outcome = { kind: 'ok'; text: string; blockReason?: string } | Failure;

/** Classifies an HTTP error status (and API error body) from the Gemini API. */
export function classifyResponse(status: number, err: GeminiResponse['error'] | undefined): Failure | null {
  if (status >= 200 && status < 300) return null;
  const msg = `${err?.status ?? ''} ${err?.message ?? ''}`.trim();
  const detail = `HTTP ${status}${msg ? ` · ${msg.slice(0, 200)}` : ''}`;
  if (/API_KEY_INVALID|API key not valid|API key expired/i.test(msg) || status === 401) {
    return { kind: 'fatal', error: new AiError('bad-key', detail) };
  }
  // Free-tier quotas are per model, so another model may still have room.
  if (status === 429) return { kind: 'next-model', error: new AiError('quota', detail) };
  // Model retired, renamed, or not open to this key (e.g. 2.5 models for new users).
  if (status === 404 || status === 403) {
    return { kind: 'next-model', error: new AiError(status === 403 ? 'bad-key' : 'server', detail) };
  }
  if (status === 400 && /not found|not supported|no longer|unsupported model|is not available/i.test(msg)) {
    return { kind: 'next-model', error: new AiError('server', detail) };
  }
  if (status === 400 && /image|inline_?data|mime/i.test(msg)) return { kind: 'fatal', error: new AiError('unreadable', detail) };
  if (status >= 500) return { kind: 'retry', error: new AiError('server', detail) };
  return { kind: 'fatal', error: new AiError('server', detail) };
}

/**
 * Incremental parser for the Server-Sent Events of streamGenerateContent (?alt=sse).
 * Feed it text as it arrives; it calls onChunk for every complete `data:` JSON line.
 */
export function createSseParser(onChunk: (chunk: GeminiResponse) => void) {
  let buf = '';
  const line = (raw: string) => {
    const l = raw.trim();
    if (!l.startsWith('data:')) return;
    const json = l.slice(5).trim();
    if (!json) return;
    try {
      onChunk(JSON.parse(json) as GeminiResponse);
    } catch {
      // A malformed line is ignored; the final validation catches a broken answer.
    }
  };
  return {
    push(text: string) {
      buf += text;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        line(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    },
    end() {
      if (buf) line(buf);
      buf = '';
    },
  };
}

/** Text of a chunk, without the model's internal "thought" parts. */
function chunkText(c: GeminiResponse): string {
  return (
    c.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('') ?? ''
  );
}

async function callModel(
  apiKey: string,
  model: string,
  body: unknown,
  onText?: (soFar: string) => void,
): Promise<Outcome> {
  if (!navigator.onLine) return { kind: 'fatal', error: new AiError('offline') };
  let res: Response;
  try {
    // Streaming lets the app show real progress while the recipe is being written.
    // The key goes in a header, not the URL, so it does not end up in logs or history.
    res = await fetch(`${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return navigator.onLine
      ? { kind: 'retry', error: new AiError('server', `network · ${e instanceof Error ? e.message : String(e)}`) }
      : { kind: 'fatal', error: new AiError('offline') };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as GeminiResponse | GeminiResponse[];
    const err = Array.isArray(data) ? data[0]?.error : data.error;
    return classifyResponse(res.status, err) ?? { kind: 'fatal', error: new AiError('server', `HTTP ${res.status}`) };
  }

  let text = '';
  let blockReason: string | undefined;
  let streamError: Failure | null = null;
  const parser = createSseParser((c) => {
    if (c.error && !streamError) streamError = classifyResponse(c.error.code ?? 500, c.error);
    if (c.promptFeedback?.blockReason) blockReason = c.promptFeedback.blockReason;
    const t = chunkText(c);
    if (t) {
      text += t;
      onText?.(text);
    }
  });
  try {
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
    } else {
      parser.push(await res.text());
    }
    parser.end();
  } catch (e) {
    return { kind: 'retry', error: new AiError('server', `stream · ${e instanceof Error ? e.message : String(e)}`) };
  }
  if (streamError) return streamError;
  return { kind: 'ok', text, blockReason };
}

/** Calls the model, falling back across models and retrying brief server errors. */
async function generate(
  apiKey: string,
  body: unknown,
  onEvent?: (e: AiEvent) => void,
): Promise<{ text: string; blockReason?: string }> {
  let lastError = new AiError('server');
  for (const model of modelOrder()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      onEvent?.({ type: 'request', model });
      const out = await callModel(apiKey, model, body, (soFar) => onEvent?.({ type: 'partial', text: soFar }));
      if (out.kind === 'ok') {
        rememberModel(model);
        return out;
      }
      lastError = new AiError(out.error.code, `${model} · ${out.error.detail ?? ''}`);
      if (out.kind === 'fatal') throw lastError;
      if (out.kind === 'next-model') {
        onEvent?.({ type: 'model-unavailable', model, quota: out.error.code === 'quota' });
        break;
      }
      onEvent?.({ type: 'server-retry' });
      await wait(1500); // overloaded or flaky: try the same model once more
    }
  }
  throw lastError;
}

/** Sends text and/or images to Gemini and returns a validated recipe. Retries once on a bad answer. */
export async function extractRecipe(
  apiKey: string,
  input: AiInput,
  onEvent?: (e: AiEvent) => void,
): Promise<{ recipe: Recipe; dishBox?: AiDishBox }> {
  if (!apiKey.trim()) throw new AiError('no-key');
  const parts: unknown[] = [];
  const images = input.images ?? [];
  if (images.length > 1) {
    parts.push({ text: `לפניך ${images.length} תמונות של אותו מתכון, לפי הסדר.` });
  }
  for (let i = 0; i < images.length; i++) {
    onEvent?.({ type: 'images', done: i, total: images.length });
    const img = images[i];
    parts.push({ inlineData: { mimeType: img.type || 'image/jpeg', data: await blobToBase64(img) } });
  }
  if (images.length) onEvent?.({ type: 'images', done: images.length, total: images.length });
  if (input.text?.trim()) parts.push({ text: input.text.trim() });
  if (parts.length === 0) throw new AiError('not-recipe');

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: geminiResponseSchema },
  };

  let lastReason: 'invalid' | 'not-recipe' | 'unreadable' = 'invalid';
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await generate(apiKey.trim(), body, onEvent);
    if (out.blockReason) throw new AiError('blocked', out.blockReason);
    onEvent?.({ type: 'validate' });
    const result = parseAiResponse(out.text, newId, Date.now());
    if (result.ok) return { recipe: result.recipe, dishBox: result.dishBox };
    lastReason = result.reason;
    // A clear "not a recipe" / "unreadable" answer will not improve on retry.
    if (result.reason !== 'invalid') break;
    if (attempt === 0) onEvent?.({ type: 'invalid-retry' });
  }
  throw new AiError(lastReason);
}

/** Checks the key with a tiny real request, so it also proves a model is reachable. Returns the model used. */
export async function checkApiKey(apiKey: string): Promise<string> {
  if (!apiKey.trim()) throw new AiError('no-key');
  await generate(apiKey.trim(), { contents: [{ role: 'user', parts: [{ text: 'ענה במילה אחת: שלום' }] }] });
  return modelOrder()[0];
}
