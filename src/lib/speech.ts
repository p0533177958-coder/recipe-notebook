// Hebrew text-to-speech via speechSynthesis.

let hebrewVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (hebrewVoice !== undefined && hebrewVoice !== null) return hebrewVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  hebrewVoice = voices.find((v) => /^(he|iw)([-_]|$)/i.test(v.lang)) ?? null;
  return hebrewVoice;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    hebrewVoice = undefined;
    pickVoice();
  };
}

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string, opts: { interrupt?: boolean } = {}): void {
  if (!ttsSupported) return;
  const synth = window.speechSynthesis;
  if (opts.interrupt !== false) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'he-IL';
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 0.95;
  u.onend = () => (lastSpokeAt = Date.now());
  u.onerror = () => (lastSpokeAt = Date.now());
  synth.speak(u);
}

/** When the app last finished saying something aloud. */
let lastSpokeAt = 0;
/** Speech recognition delivers results a moment after hearing them; ignore that echo of our own voice. */
const ECHO_MS = 800;

/** True while the app is speaking, or just finished (so the microphone does not take its own words as commands). */
export function isSpeaking(): boolean {
  if (!ttsSupported) return false;
  return window.speechSynthesis.speaking || Date.now() - lastSpokeAt < ECHO_MS;
}

export function stopSpeaking(): void {
  if (ttsSupported) window.speechSynthesis.cancel();
}
