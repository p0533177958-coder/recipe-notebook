import { normalizeHebrew } from './search';

export type VoiceCommand =
  | 'next'
  | 'prev'
  | 'startTimer'
  | 'stop'
  | 'timeLeft'
  | 'read'
  | 'ingredients';

// Ordered: more specific phrases first ("כמה זמן" first, "עצור" before the bare word "טיימר").
const COMMANDS: { cmd: VoiceCommand; phrases: string[] }[] = [
  { cmd: 'timeLeft', phrases: ['כמה זמן נשאר', 'כמה נשאר', 'כמה זמן', 'זמן נשאר', 'מה הזמן'] },
  { cmd: 'stop', phrases: ['עצור', 'תעצור', 'עצרי', 'די', 'מספיק', 'שקט', 'הפסק', 'תפסיק', 'סטופ'] },
  { cmd: 'startTimer', phrases: ['הפעל טיימר', 'תפעיל טיימר', 'הפעל את הטיימר', 'הפעילי טיימר', 'תתחיל טיימר', 'התחל טיימר', 'טיימר', 'תפעיל את הטיימר', 'הטיימר'] },
  { cmd: 'ingredients', phrases: ['מצרכים', 'מה צריך', 'רכיבים', 'מרכיבים'] },
  { cmd: 'read', phrases: ['תקריא', 'הקרא', 'תקריאי', 'תקרא', 'קרא', 'תחזור על זה', 'שוב', 'מה השלב'] },
  { cmd: 'prev', phrases: ['הקודם', 'קודם', 'אחורה', 'חזור', 'תחזור', 'חזרה', 'שלב קודם', 'אחורנית'] },
  { cmd: 'next', phrases: ['הבא', 'הלאה', 'תמשיך', 'המשך', 'קדימה', 'שלב הבא', 'הבאה', 'נמשיך', 'סיימתי'] },
];

const NORMALIZED = COMMANDS.map(({ cmd, phrases }) => ({
  cmd,
  phrases: phrases.map(normalizeHebrew),
}));

/** Maps a recognised utterance to a command, tolerating extra words around it. */
export function matchVoiceCommand(transcript: string): VoiceCommand | null {
  const text = ` ${normalizeHebrew(transcript)} `;
  if (!text.trim()) return null;
  for (const { cmd, phrases } of NORMALIZED) {
    for (const p of phrases) {
      if (text.includes(` ${p} `)) return cmd;
    }
  }
  return null;
}
