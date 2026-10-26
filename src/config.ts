/**
 * Gemini models for recipe extraction, in order of preference. Change here to switch models.
 * If a model is unavailable for the key (retired, restricted, or out of free quota),
 * the next one is tried. The "-latest" alias is a last resort that Google keeps pointing at a current model.
 */
export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const AI_STUDIO_URL = 'https://aistudio.google.com/apikey';

/** Max edge (px) and JPEG quality for stored images. */
export const IMAGE_MAX_EDGE = 1200;
export const IMAGE_QUALITY = 0.8;

export const MIN_COOK_FONT = 26;
export const MAX_COOK_FONT = 44;
