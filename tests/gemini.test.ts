import { describe, expect, it } from 'vitest';
import { classifyResponse } from '../src/lib/gemini';

describe('classifyResponse', () => {
  it('passes successful responses through', () => {
    expect(classifyResponse(200, undefined)).toBeNull();
  });

  it('treats an invalid key as fatal', () => {
    const out = classifyResponse(400, { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' });
    expect(out?.kind).toBe('fatal');
    expect(out?.error.code).toBe('bad-key');
  });

  it('falls back to another model when a model is missing or restricted', () => {
    expect(classifyResponse(404, { message: 'models/gemini-2.5-flash is not found' })?.kind).toBe('next-model');
    expect(classifyResponse(403, { status: 'PERMISSION_DENIED' })?.kind).toBe('next-model');
    expect(classifyResponse(400, { message: 'model is not supported for generateContent' })?.kind).toBe('next-model');
  });

  it('tries another model on quota, and reports quota if all are exhausted', () => {
    const out = classifyResponse(429, { status: 'RESOURCE_EXHAUSTED' });
    expect(out?.kind).toBe('next-model');
    expect(out?.error.code).toBe('quota');
  });

  it('retries temporary server errors', () => {
    expect(classifyResponse(503, { message: 'The model is overloaded' })?.kind).toBe('retry');
    expect(classifyResponse(500, undefined)?.kind).toBe('retry');
  });

  it('keeps the HTTP status and API message as detail', () => {
    const out = classifyResponse(503, { status: 'UNAVAILABLE', message: 'overloaded' });
    expect(out?.error.detail).toBe('HTTP 503 · UNAVAILABLE overloaded');
  });
});
