#!/usr/bin/env node
/**
 * stamp.mjs — Oct 10 Political Education Party.
 *
 *   node tools/oct10-kit/stamp.mjs
 *
 * oct10/event.json is the single source of truth. The page renders from it at
 * runtime, but link-preview scrapers and search engines don't run JavaScript,
 * so this stamps the facts they need into the static <head> of:
 *
 *   events/political-education-party/index.html   (the page)
 *   oct10/index.html                               (the short link every QR points at)
 *
 * and rebuilds oct10/downloads/political-education-party-kit.zip (every asset +
 * captions.txt) for the "Download everything" button.
 *
 * Change a fact → edit event.json → run this → commit. Never hand-edit the
 * stamped blocks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const E = JSON.parse(fs.readFileSync(path.join(ROOT, 'oct10/event.json'), 'utf8'));
const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const card = E.assets.find(a => a.id === 'card');
const img = 'https://freekarmelo.net/' + card.png.replace(/^\//, '');
const md = new Date(E.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
const title = `${E.name} · ${md} · Free Karmelo`;
const desc = E.shareText;
if (desc.length > 165 || desc.length < 50) console.warn(`! shareText is ${desc.length} chars (description wants 50–165)`);

const v = E.venue;
const ld = {
  '@context': 'https://schema.org', '@type': 'Event', name: E.name, description: E.shareText,
  startDate: E.start, endDate: E.end,
  eventStatus: 'https://schema.org/' + (E.status === 'moved' ? 'EventRescheduled' : 'EventScheduled'),
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
  location: { '@type': 'Place', name: v.name, address: { '@type': 'PostalAddress', streetAddress: v.street, addressLocality: v.city, addressRegion: v.region, postalCode: v.postal, addressCountry: 'US' } },
  organizer: { '@type': 'Organization', name: E.umbrella, url: 'https://freekarmelo.net' },
  image: [img], url: E.url,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: E.url }
};

function head(canonical, extra = '') {
  return `<!-- EVENT-HEAD: stamped from /oct10/event.json by tools/oct10-kit/stamp.mjs — do not hand-edit -->
<title>${attr(title)}</title>
<meta name="description" content="${attr(desc)}">
<link rel="canonical" href="${attr(E.url.replace(/\/?$/, '/'))}">
<meta property="og:url" content="${attr(canonical)}">
<meta property="og:title" content="${attr(`${E.name} — ${E.dateLong}, ${E.timeLabel}`)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:image" content="${attr(img)}">
<meta property="og:image:width" content="${card.w}">
<meta property="og:image:height" content="${card.h}">
<meta property="og:image:alt" content="${attr(card.alt)}">
<meta name="twitter:title" content="${attr(`${E.name} — ${E.dateLong}`)}">
<meta name="twitter:description" content="${attr(desc)}">
<meta name="twitter:image" content="${attr(img)}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>${extra}
<!-- /EVENT-HEAD -->`;
}

function stamp(rel, block) {
  const p = path.join(ROOT, rel);
  const h = fs.readFileSync(p, 'utf8');
  const re = /<!-- EVENT-HEAD[\s\S]*?<!-- \/EVENT-HEAD -->/;
  if (!re.test(h)) throw new Error(`${rel}: no EVENT-HEAD markers`);
  let out = h.replace(re, block);
  out = out.replace(/<!-- EVENT-H1 -->[\s\S]*?<!-- \/EVENT-H1 -->/, `<!-- EVENT-H1 --><h1>${attr(E.name)}</h1><!-- /EVENT-H1 -->`);
  fs.writeFileSync(p, out);
  console.log('stamped', rel);
}

// GitHub Pages serves a directory index at the slashed URL; canonicalise to it.
const canon = E.url.replace(/\/?$/, '/');
const pagePath = new URL(canon).pathname;
stamp('events/political-education-party/index.html', head(canon));
stamp('oct10/index.html', head('https://' + E.shortUrl,
  `\n<meta http-equiv="refresh" content="0; url=${attr(pagePath)}">`));

// share-kit thumbnails (the cards show these; PNG/PDF buttons serve the originals)
const thumbs = path.join(ROOT, 'oct10/downloads/thumbs');
fs.mkdirSync(thumbs, { recursive: true });
execFileSync('python3', ['-c', `import sys,os
from PIL import Image
out=sys.argv[1]
for f in sys.argv[2:]:
    im=Image.open(f).convert('RGB'); im.thumbnail((520,520), Image.LANCZOS)
    im.save(os.path.join(out, os.path.basename(f)[:-4]+'.jpg'),'JPEG',quality=82,optimize=True,progressive=True)`,
  thumbs, ...E.assets.map(a => path.join(ROOT, a.png))]);
console.log('thumbs', E.assets.length);

// kit zip
const dl = path.join(ROOT, 'oct10/downloads');
const zipName = `${E.slug}-kit.zip`;
const tmp = fs.mkdtempSync(path.join(ROOT, '.kit-'));
try {
  const files = [];
  for (const a of E.assets) for (const f of [a.png, a.pdf].filter(Boolean)) {
    const src = path.join(ROOT, f); if (!fs.existsSync(src)) throw new Error('missing asset ' + f);
    fs.copyFileSync(src, path.join(tmp, path.basename(f))); files.push(path.basename(f));
  }
  fs.writeFileSync(path.join(tmp, 'captions.txt'),
    E.captions.map(c => `${c.label}\n${c.text}\n`).join('\n') + `\n${E.posture}\n${E.url}\n`);
  files.push('captions.txt');
  const out = path.join(dl, zipName);
  fs.rmSync(out, { force: true });
  execFileSync('python3', ['-c', `import zipfile,sys,os
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)
for f in sys.argv[3:]:
    zi=zipfile.ZipInfo(f,(2026,10,1,0,0,0)); zi.compress_type=zipfile.ZIP_DEFLATED; zi.external_attr=0o644<<16
    z.writestr(zi,open(os.path.join(sys.argv[2],f),'rb').read())
z.close()`, out, tmp, ...files]);
  console.log('kit', path.relative(ROOT, out), (fs.statSync(out).size / 1048576).toFixed(1) + ' MB,', files.length, 'files');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
