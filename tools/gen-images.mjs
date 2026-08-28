#!/usr/bin/env node
/**
 * gen-images.mjs — never ship a full-size original again.
 *
 *   npm i sharp            (once)
 *   node tools/gen-images.mjs assets/your-photo.jpg
 *
 * Writes AVIF / WebP / JPEG at 480, 800, 1200, 1600 into assets/r/
 * and prints the <picture> block to paste.
 */
import fs from 'node:fs';
import path from 'node:path';

let sharp;
try { sharp = (await import('sharp')).default; }
catch { console.error('sharp is not installed.  npm i sharp'); process.exit(1); }

const WIDTHS = [480, 800, 1200, 1600];
const args = process.argv.slice(2);
if (!args.length) { console.error('usage: node tools/gen-images.mjs assets/photo.jpg [more.jpg…]'); process.exit(1); }

const ROOT = process.cwd();
const OUTDIR = path.join(ROOT, 'assets', 'r');
fs.mkdirSync(OUTDIR, { recursive: true });

for (const rel of args) {
  const src = path.resolve(ROOT, rel);
  if (!fs.existsSync(src)) { console.error('not found: ' + rel); continue; }

  const base = path.basename(src).replace(/\.[a-z0-9]+$/i, '');
  const meta = await sharp(src).metadata();
  const srcKb = fs.statSync(src).size / 1024;
  console.log(`\n${rel}  ${meta.width}x${meta.height}  ${srcKb.toFixed(0)} KB`);

  const made = [];
  for (const w of WIDTHS) {
    if (w > meta.width) continue;
    for (const [ext, opts] of [
      ['avif', { quality: 52, effort: 6 }],
      ['webp', { quality: 74 }],
      ['jpg',  { quality: 78, mozjpeg: true, progressive: true }],
    ]) {
      const out = path.join(OUTDIR, `${base}-${w}.${ext}`);
      const p = sharp(src).resize({ width: w, withoutEnlargement: true });
      await (ext === 'avif' ? p.avif(opts) : ext === 'webp' ? p.webp(opts) : p.jpeg(opts)).toFile(out);
      made.push({ w, ext, kb: fs.statSync(out).size / 1024 });
    }
  }
  const list = (ext) => made.filter(m => m.ext === ext)
    .map(m => `assets/r/${base}-${m.w}.${ext} ${m.w}w`).join(', ');
  const phone = made.find(m => m.w === 800 && m.ext === 'avif');
  if (phone) console.log(`   a phone pulls ${phone.kb.toFixed(0)} KB instead of ${srcKb.toFixed(0)} KB`);

  console.log(`
<picture>
  <source type="image/avif" sizes="100vw" srcset="${list('avif')}">
  <source type="image/webp" sizes="100vw" srcset="${list('webp')}">
  <img src="assets/r/${base}-800.jpg" width="${meta.width}" height="${meta.height}"
       sizes="100vw" srcset="${list('jpg')}"
       alt="DESCRIBE THIS IMAGE" loading="lazy" decoding="async">
</picture>`);
}
