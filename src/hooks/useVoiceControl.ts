import { useCallback, useEffect, useRef, useState } from 'react';
import { isSpeaking } from '../lib/speech';
import { matchVoiceCommand, type VoiceCommand } from '../lib/voice';

// Minimal typings: SpeechRecognition is not in TypeScript's DOM lib.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const voiceSupported = typeof window !== 'undefined' && !!getCtor();

/** Continuous Hebrew voice commands; restarts automatically when Chrome ends the session. */
export function useVoiceControl(onCommand: (cmd: VoiceCommand) => void) {
  const [listening, setListening] = useState(false);
  const wanted = useRef(false);
  const rec = useRef<Recognition | null>(null);
  const handler = useRef(onCommand);
  handler.current = onCommand;

  const stop = useCallback(() => {
    wanted.current = false;
    setListening(false);
    rec.current?.abort();
    rec.current = null;
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    wanted.current = true;
    setListening(true);
    const r = new Ctor();
    r.lang = 'he-IL';
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res.isFinal) continue;
        // Ignore what the app itself is saying aloud.
        if (isSpeaking()) continue;
        const cmd = matchVoiceCommand(res[0].transcript);
        if (cmd) handler.current(cmd);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') stop();
    };
    r.onend = () => {
      if (!wanted.current) return;
      // Chrome stops after silence or errors; resume shortly after.
      setTimeout(() => {
        if (!wanted.current) return;
        try {
          r.start();
        } catch {
          // Already started.
        }
      }, 250);
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      stop();
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { supported: voiceSupported, listening, toggle: () => (listening ? stop() : start()) };
}
