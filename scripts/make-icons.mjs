// Renders scripts/icon.svg to every icon size the PWA needs.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
// Maskable icons need the art inside the central 80% safe zone.
const maskable = svg.replace('<g transform="translate(256 270)">', '<g transform="translate(256 266) scale(0.78)">');

mkdirSync('public/icons', { recursive: true });
const render = (src, size, out) => {
  const png = new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(out, png);
  console.log('wrote', out);
};
render(svg, 192, 'public/icons/icon-192.png');
render(svg, 512, 'public/icons/icon-512.png');
render(maskable, 512, 'public/icons/icon-maskable-512.png');
render(svg, 180, 'public/apple-touch-icon.png');
// Favicon with rounded corners
writeFileSync('public/favicon.svg', svg.replace('rx="0"', 'rx="110"'));
console.log('wrote public/favicon.svg');
