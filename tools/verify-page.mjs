#!/usr/bin/env node
/**
 * verify-page.mjs — prove a page works before it ships.
 *
 *   node tools/verify-page.mjs weekend solidarity
 *   node tools/verify-page.mjs index.html --keep
 *
 * check-pages.mjs reads the markup. This one runs the page: it serves the repo
 * over http (so sibling fetches like ../solidarity/solidarity.json resolve),
 * opens it at four widths plus a reduced-motion pass, scrolls it the way a
 * person actually does, and fails on the things that have really broken pages
 * here — a sideways phone layout, a script error, a photograph left invisible
 * because a fast scroll skipped its observer, a canvas that never painted, an
 * image whose src is wrong.
 *
 * Needs Playwright (`npm i playwright`). It does NOT download a browser: this
 * container already ships one under /opt/pw-browsers and npm's copy expects a
 * build that is not there, so we always launch with an explicit executablePath.
 * Not wired into CI — GitHub's runner has no browser and no need of one.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const targets = argv.filter(a => !a.startsWith('--'));
if (!targets.length) {
  console.error('usage: node tools/verify-page.mjs <page> [page...] [--keep]\n' +
                '       page is a path under the repo: "weekend", "solidarity", "index.html"');
  process.exit(2);
}

/* the container's preinstalled browser, whichever build it is today */
function chromiumPath() {
  const base = '/opt/pw-browsers';
  if (!fs.existsSync(base)) return null;
  const dir = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
  if (!dir) return null;
  const exe = path.join(base, dir, 'chrome-linux', 'chrome');
  return fs.existsSync(exe) ? exe : null;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.txt': 'text/plain' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let f = path.join(ROOT, p);
      try {
        if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
        const body = fs.readFileSync(f);
        res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream',
                             'content-length': body.length });
        res.end(body);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

/* runs inside the page */
function audit() {
  const vis = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const s = getComputedStyle(el);
    return s.position !== 'fixed' && s.display !== 'none';
  };
  const stranded = [...document.querySelectorAll('body *')].filter(el => {
    if (!vis(el)) return false;
    if (el.closest('[role="dialog"],[aria-hidden="true"],[hidden]')) return false;
    const s = getComputedStyle(el);
    /* Meant to fade in on scroll: transitions opacity, still at 0, and still
       interactive. A hover overlay sits at opacity 0 with pointer-events:none
       by design, and is not a photograph nobody can see. */
    return parseFloat(s.opacity) === 0 && /opacity/.test(s.transitionProperty)
           && s.pointerEvents !== 'none';
  }).map(el => el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]);

  /* A canvas is only a failure if it is a VISIBLE 2D canvas that painted
     nothing. A WebGPU or WebGL canvas cannot be sampled, and this container has
     no GPU adapter at all, so a progressive-enhancement hero is blank here by
     design — reporting that as a bug would teach everyone to ignore this tool. */
  const canvases = [...document.querySelectorAll('canvas')].map(c => {
    const id = c.id || c.className || '(canvas)';
    const kind = c.__fkCtx || 'none';
    const r = c.getBoundingClientRect();
    if (getComputedStyle(c).display === 'none' || r.width < 2 || r.height < 2)
      return { id, kind, skip: 'not displayed' };
    if (kind !== '2d') return { id, kind, skip: 'no GPU adapter here' };
    if (!c.width || !c.height) return { id, kind, painted: 0 };
    let n = 0;
    try {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4 * 29) if (d[i] > 8) n++;
    } catch { return { id, kind, skip: 'unreadable' }; }
    return { id, kind, painted: n };
  });

  const imgs = [...document.querySelectorAll('img')];
  return {
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    stranded: stranded.slice(0, 8),
    strandedCount: stranded.length,
    canvases,
    brokenImages: imgs.filter(i => i.complete && i.naturalWidth === 0 && i.currentSrc)
                      .map(i => i.getAttribute('src')).slice(0, 6),
    images: imgs.length
  };
}

const VIEWS = [
  { label: 'phone   390', opts: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { label: 'tablet  834', opts: { viewport: { width: 834, height: 1112 } } },
  { label: 'laptop 1024', opts: { viewport: { width: 1024, height: 768 } } },
  { label: 'desktop 1440', opts: { viewport: { width: 1440, height: 950 } } },
  { label: 'reduced motion', opts: { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' } }
];

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('Playwright is not installed here.\n  npm i playwright        # do NOT run "playwright install"\n' +
                'The browser is already on this machine under /opt/pw-browsers.');
  process.exit(2);
}
const exe = chromiumPath();
if (!exe) { console.error('No chromium under /opt/pw-browsers — set one up or run this elsewhere.'); process.exit(2); }

const { srv, port } = await serve();
const shots = KEEP ? fs.mkdtempSync(path.join(os.tmpdir(), 'verify-')) : null;
const browser = await chromium.launch({ executablePath: exe });
let failures = 0;

for (const target of targets) {
  const url = `http://127.0.0.1:${port}/${target.replace(/^\/+/, '')}${target.endsWith('.html') ? '' : '/'}`;
  console.log(`\n── ${target}  ${url}`);

  for (const v of VIEWS) {
    const ctx = await browser.newContext(v.opts);
    const page = await ctx.newPage();
    const errs = [];
    let bytes = 0;
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    /* the sandbox cannot reach Google Fonts or gtag; that noise is not the page's fault */
    page.on('console', m => {
      if (m.type() === 'error' && !/net::|ERR_CONNECTION|Failed to load resource/.test(m.text()))
        errs.push('console: ' + m.text());
    });
    const weights = [];
    page.on('response', r => {
      const n = parseInt(r.headers()['content-length'] || '0', 10);
      bytes += n;
      if (n > 40000) weights.push([n, r.url().replace(/^https?:\/\/[^/]+/, '')]);
    });

    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (!this.__fkCtx) this.__fkCtx = type;
        return orig.call(this, type, ...rest);
      };
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);

    /* jump to the bottom the way a hash link does, then walk back up the way a reader does */
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1100);
    for (let f = 1; f >= 0; f -= 0.2) {
      await page.evaluate(k => window.scrollTo(0, document.body.scrollHeight * k), f);
      await page.waitForTimeout(320);
    }
    await page.waitForTimeout(600);

    const a = await page.evaluate(audit);
    const bad = [];
    if (a.overflow > 0) bad.push(`page scrolls sideways by ${a.overflow}px`);
    if (a.strandedCount) bad.push(`${a.strandedCount} element(s) never faded in: ${a.stranded.join(', ')}`);
    if (a.brokenImages.length) bad.push(`broken image src: ${a.brokenImages.join(', ')}`);
    for (const c of a.canvases) if (!c.skip && c.painted === 0) bad.push(`2d canvas #${c.id} never painted`);
    const skipped = a.canvases.filter(c => c.skip);
    bad.push(...errs);

    if (shots) await page.screenshot({ path: path.join(shots, `${target.replace(/\W+/g, '-')}-${v.opts.viewport.width}.png`) });
    await ctx.close();

    const mb = (bytes / 1048576).toFixed(2);
    /* a rally page is opened on a phone on cellular; over ~3MB, name the culprits */
    if (bytes > 3 * 1048576) {
      const top = weights.sort((a, b) => b[0] - a[0]).slice(0, 3)
        .map(([n, u]) => `${(n / 1024).toFixed(0)}KB ${u}`);
      console.log(`   ! ${v.label} is ${mb} MB — heaviest: ${top.join('  ·  ')}`);
    }
    if (bad.length) {
      failures += bad.length;
      console.log(`   ✗ ${v.label}   ${mb} MB`);
      bad.forEach(b => console.log(`       ${b}`));
    } else {
      const painted = a.canvases.filter(c => !c.skip).length;
      console.log(`   ✓ ${v.label}   ${mb} MB   ${a.images} images` +
                  (painted ? `, ${painted} canvas painted` : '') +
                  (skipped.length ? `   (skipped: ${skipped.map(c => '#' + c.id + ' ' + c.skip).join(', ')})` : ''));
    }
  }
}

await browser.close();
srv.close();
if (shots) console.log(`\nscreenshots: ${shots}`);
console.log(failures ? `\n${failures} problem(s) — do not ship.` : '\nAll clear.');
process.exit(failures ? 1 : 0);
