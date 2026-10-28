// Lists emoji left in the interface code (src/). Allowed places, per the design rules:
// recipe emoji as data (seed.ts), share text (shareText.ts), the AI prompt (aiPrompt.ts),
// prep-hint kinds that are data (prepAhead.ts), and test files.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23E9}-\u{23FA}\u{25B6}\u{2705}\u{FE0F}]/u;
const ALLOWED = ['seed.ts', 'shareText.ts', 'aiPrompt.ts', 'prepAhead.ts', 'PrepAhead.tsx', 'aiRecipe.ts', 'backupFormat.ts', 'shopping.ts'];
// A line can also opt out with an 'emoji-ok' comment (recipe emoji used as data).

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

let found = 0;
for (const file of walk('src').filter((f) => /\.(tsx?|css)$/.test(f))) {
  if (ALLOWED.some((a) => file.endsWith(a))) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (EMOJI.test(line) && !line.includes('emoji-ok')) {
        found++;
        console.log(`${file.replaceAll('\\', '/')}:${i + 1}: ${line.trim().slice(0, 110)}`);
      }
    });
}
console.log(found ? `\n${found} line(s) with emoji` : 'No emoji in the interface code.');
process.exitCode = found ? 1 : 0;
