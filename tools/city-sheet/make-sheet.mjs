#!/usr/bin/env node
/* Compose a city's solidarity sheet from the live roster.
 *
 *   node make-sheet.mjs detroit          one city
 *   node make-sheet.mjs --all            every city on the roster
 *   node make-sheet.mjs detroit --wire   also point solidarity.json at it
 *
 * Stage 1 renders the background on the GPU through vgpu/Dawn (headless,
 * works on a server with no graphics card). Stage 2 draws the typography.
 * The city's facts come from solidarity.json, so a city approved in the
 * moderation console can have its sheet built without a designer.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBackground, gpuOnce } from './background.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

const SITE = resolve(opt('--site', join(HERE, '..', '..', 'solidarity')));
const JSON_PATH = join(SITE, 'solidarity.json');
const OUT_DIR = join(SITE, 'flyers-cities');
const WEB_DIR = join(OUT_DIR, 'web');
const W = 1080, H = 1350;

if (!existsSync(JSON_PATH)) {
  console.error(`Cannot find ${JSON_PATH}\nPass --site /path/to/solidarity`);
  process.exit(1);
}
const roster = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
/* --all rewrites <slug>.png for EVERY city, including the sheets local
   organizers made themselves. That is almost never what you want, so it
   requires --force-overwrite-organizer-art said out loud. */
if (flag('--all') && !flag('--force-overwrite-organizer-art')) {
  console.error(
    '--all regenerates a sheet for every city on the roster, overwriting any\n' +
    'organizer-made art already in flyers-cities/.\n\n' +
    'Name the cities you actually mean:  node make-sheet.mjs detroit hartford\n' +
    'If you truly intend to replace every sheet, add --force-overwrite-organizer-art.');
  process.exit(1);
}
const slugs = flag('--all')
  ? roster.cities.map(c => c.slug)
  : argv.filter(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--site');

if (!slugs.length && !flag('--master')) {
  console.error('Name a city slug, or pass --all.\n' +
    'On the roster: ' + roster.cities.map(c => c.slug).join(', '));
  process.exit(1);
}

const python = spec => new Promise((res, rej) => {
  const p = spawn('python3', [join(HERE, 'compose.py')], { stdio: ['pipe', 'pipe', 'inherit'] });
  let out = '';
  p.stdout.on('data', d => (out += d));
  p.on('close', code => code === 0 ? res(JSON.parse(out)) : rej(new Error('compose.py exited ' + code)));
  p.stdin.end(JSON.stringify(spec));
});

const GPU = await gpuOnce();

if (flag('--master')) {
  const bg = join(HERE, '.bg-master.png');
  await renderBackground({ slug: 'universal-roll', width: W, height: H, out: bg, gpu: await gpuOnce() });
  const outPng = join(SITE, 'flyers-final', 'universal-broadside-1080x1350.png');
  const outWebp = join(SITE, 'flyers-web', 'universal-broadside.webp');
  const r = await python({
    master: true,
    qr: resolve(join(SITE, '..', 'assets', 'solidarity', 'qr-solidarity-gold.png')),
    city: { name: 'WORLDWIDE', region: '', slug: '__master__' },
    roster: roster.cities, dates: roster.dates || null,
    background: bg, out_png: outPng, out_webp: outWebp
  });
  rmSync(bg, { force: true });
  console.log(`universal broadside  ${r.png_kb} KB print  ${r.webp_kb} KB web`);
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(WEB_DIR, { recursive: true });
const made = [];

for (const slug of slugs) {
  const city = roster.cities.find(c => c.slug === slug);
  if (!city) { console.error(`! "${slug}" is not on the roster — skipped`); continue; }

  const bg = join(HERE, `.bg-${slug}.png`);
  await renderBackground({ slug, width: W, height: H, out: bg, gpu: GPU });

  const outPng = join(OUT_DIR, `${slug}.png`);
  const outWebp = join(WEB_DIR, `${slug}.webp`);
  const r = await python({
    city, roster: roster.cities, dates: roster.dates || null,
    background: bg, out_png: outPng, out_webp: outWebp
  });
  rmSync(bg, { force: true });

  made.push({ slug, ...r });
  console.log(`${city.name.padEnd(16)} ${String(r.png_kb).padStart(5)} KB print  ${String(r.webp_kb).padStart(4)} KB web`);
}

if (flag('--wire') && made.length) {
  for (const m of made) {
    const c = roster.cities.find(x => x.slug === m.slug);
    c.flyer = `flyers-cities/${m.slug}.png`;
    c.art = `flyers-cities/web/${m.slug}.webp`;
  }
  writeFileSync(JSON_PATH, JSON.stringify(roster, null, 2) + '\n');
  console.log(`\nsolidarity.json now points at ${made.length} generated sheet(s).`);
}
console.log(`\n${made.length} sheet(s) built.`);
process.exit(0);
