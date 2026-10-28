import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../components/ui';
import { isSpeaking } from '../lib/speech';
import { matchVoiceCommand, type VoiceCommand } from '../lib/voice';
import { S } from '../strings.he';

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
        const cmd = matchVoiceCommand(res[0].transcript);
        if (!cmd) continue;
        // Ignore what the app itself is saying aloud (its own echo), except "עצור": that is exactly
        // what people say over a timer announcement, and it can only silence or stop reading.
        if (cmd !== 'stop' && isSpeaking()) continue;
        handler.current(cmd);
      }
    };
    r.onerror = (e) => {
      // Permanent problems: stop, and say why (otherwise the mic just turns off silently).
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stop();
        toast(S.cook.micDenied);
      } else if (e.error === 'audio-capture') {
        stop();
        toast(S.cook.micMissing);
      }
      // Anything else (no-speech, network, aborted) ends the session; onend restarts it.
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
