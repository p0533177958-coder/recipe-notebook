// Alarm chime synthesised with the Web Audio API (no audio files).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Call from a user gesture (e.g. starting a timer) so later alarms are allowed to play. */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

function bell(c: AudioContext, freq: number, start: number, duration: number, gain: number) {
  // A soft bell: fundamental plus a quieter overtone, quick attack and long decay.
  for (const [mult, level] of [[1, 1], [2.76, 0.25], [5.4, 0.08]] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain * level, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g).connect(c.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }
}

/** One phrase of the chime: a gentle rising three-note arpeggio. */
export function playChime(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime + 0.05;
  bell(c, 659.25, t, 1.2, 0.25); // E5
  bell(c, 830.61, t + 0.18, 1.2, 0.22); // G#5
  bell(c, 987.77, t + 0.36, 1.6, 0.22); // B5
}

let loop: number | null = null;

/** Repeats the chime and vibration until stopAlarm() is called. */
export function startAlarm(): void {
  if (loop !== null) return;
  const ring = () => {
    playChime();
    // A clear, unmistakable pattern: long, short, long.
    navigator.vibrate?.([600, 150, 200, 150, 600]);
  };
  ring();
  loop = window.setInterval(ring, 2200);
}

export function stopAlarm(): void {
  if (loop === null) return;
  clearInterval(loop);
  loop = null;
  navigator.vibrate?.(0);
}
