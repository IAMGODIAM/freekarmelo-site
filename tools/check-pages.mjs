#!/usr/bin/env node
/**
 * check-pages.mjs â€” the site standard, enforced.
 *
 * Every rule here exists because something actually broke on this site.
 * Run locally:  node tools/check-pages.mjs
 * CI runs it on every push; a FAIL blocks the merge.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GA4 = 'G-05PYDYP5S0';
const INTAKE = 'e5-fk-events';
const SKIP_DIRS = new Set(['node_modules', '.git', 'hero-lab', 'freekarmelo-shared', '_template']);

const fail = [], warn = [];
const F = (page, rule, msg) => fail.push({ page, rule, msg });
const W = (page, rule, msg) => warn.push({ page, rule, msg });

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const pages = walk(ROOT);
const routes = new Set(
  pages.map(p => {
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    return '/' + rel.replace(/index\.html$/, '').replace(/\.html$/, '');
  }).map(r => r.replace(/\/$/, '') || '/')
);

for (const file of pages) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const h = fs.readFileSync(file, 'utf8');
  const isHome = rel === 'index.html';

  // â”€â”€ structure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const h1 = (h.match(/<h1[\s>]/g) || []).length;
  if (h1 === 0) F(rel, 'one-h1', 'no <h1> on the page');
  else if (h1 > 1) F(rel, 'one-h1', `${h1} <h1> elements â€” exactly one is the page's headline`);

  if (!/<meta[^>]+name=["']viewport["']/.test(h)) F(rel, 'viewport', 'missing viewport meta');

  // â”€â”€ the head that every page owes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const title = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (!title || !title.trim()) F(rel, 'title', 'missing <title>');
  else if (title.length > 70) W(rel, 'title', `title is ${title.length} chars â€” Google truncates near 60`);

  const desc = (h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/) || [])[1];
  if (!desc) F(rel, 'description', 'missing meta description');
  else if (desc.length < 50) W(rel, 'description', `description is only ${desc.length} chars`);
  else if (desc.length > 165) W(rel, 'description', `description is ${desc.length} chars â€” truncates near 160`);

  if (!/rel=["']canonical["']/.test(h)) W(rel, 'canonical', 'no canonical link');
  for (const og of ['og:title', 'og:description', 'og:image']) {
    if (!h.includes(og)) W(rel, 'open-graph', `missing ${og} â€” shares will look bare`);
  }

  // â”€â”€ measurement: this is what the Ad Grant depends on â”€â”€â”€â”€â”€â”€â”€
  if (!h.includes(GA4)) F(rel, 'analytics', `no ${GA4} tag â€” this page is invisible to Google Ads`);

  // â”€â”€ dead links: the bug that cost us conversions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ids = new Set([...h.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]));
  for (const m of h.matchAll(/href=["']#([^"']+)["']/g)) {
    if (!ids.has(m[1])) F(rel, 'dead-anchor', `href="#${m[1]}" but no element has that id`);
  }
  for (const m of h.matchAll(/href=["'](\/[^"'#?]*)(?:[#?][^"']*)?["']/g)) {
    const raw = m[1];
    const ext = (raw.match(/\.([a-z0-9]{2,5})$/i) || [])[1];
    if (ext && ext.toLowerCase() !== 'html') {
      // a real file (pdf, png, svgâ€¦) â€” check the filesystem, not the route table
      if (!fs.existsSync(path.join(ROOT, raw.replace(/^\//, ''))))
        F(rel, 'dead-file', `links to ${raw} â€” that file is not in the repo`);
      continue;
    }
    const r = raw.replace(/\/$/, '') || '/';
    if (!routes.has(r)) F(rel, 'dead-link', `links to ${raw} â€” no such page in the repo`);
  }
  // an off-page anchor must exist on the page it points at
  for (const m of h.matchAll(/href=["'](\/[^"'#?]*)#([^"']+)["']/g)) {
    const r = (m[1].replace(/\/$/, '') || '/');
    const target = pages.find(p => {
      const pr = '/' + path.relative(ROOT, p).replace(/\\/g, '/').replace(/index\.html$/, '').replace(/\.html$/, '');
      return (pr.replace(/\/$/, '') || '/') === r;
    });
    if (target) {
      const th = fs.readFileSync(target, 'utf8');
      if (!new RegExp(`\\sid=["']${m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(th))
        F(rel, 'dead-anchor', `href="${m[1]}#${m[2]}" but that page has no #${m[2]}`);
    }
  }

  // â”€â”€ images â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const m of h.matchAll(/<img\b([^>]*)>/g)) {
    const tag = m[1];
    const src = (tag.match(/src=["']([^"']+)["']/) || [])[1] || '(no src)';
    if (!/\balt=/.test(tag)) F(rel, 'img-alt', `<img src="${src}"> has no alt`);
    if (!/\bwidth=/.test(tag) || !/\bheight=/.test(tag))
      W(rel, 'img-dims', `<img src="${src}"> has no width/height â€” causes layout shift`);
    if (src.startsWith('assets/') || src.startsWith('/assets/')) {
      const abs = path.join(path.dirname(file), src.replace(/^\//, ''));
      const alt = path.join(ROOT, src.replace(/^\//, ''));
      const real = fs.existsSync(abs) ? abs : (fs.existsSync(alt) ? alt : null);
      if (!real) F(rel, 'img-missing', `<img src="${src}"> does not exist`);
      else {
        const kb = fs.statSync(real).size / 1024;
        if (kb > 250 && !/srcset=/.test(tag))
          W(rel, 'img-weight', `${src} is ${kb.toFixed(0)} KB with no srcset`);
      }
    }
  }

  // â”€â”€ forms must reach the intake worker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (/<form\b/.test(h) && !h.includes(INTAKE))
    F(rel, 'form-wiring', `has a <form> but never references ${INTAKE}`);

  // â”€â”€ the homepage carries the conversion path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isHome) {
    if (!/id=["']signup["']/.test(h)) F(rel, 'home-signup', 'homepage has no #signup section');
    if (!/generate_lead/.test(h)) W(rel, 'home-conversion', "no generate_lead event â€” Ads still can't count a signup");
  }
}

// â”€â”€ report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const group = (rows) => {
  const by = {};
  for (const r of rows) (by[r.page] ||= []).push(r);
  return by;
};
const print = (label, rows, mark) => {
  if (!rows.length) return;
  console.log(`\n${label} (${rows.length})`);
  const by = group(rows);
  for (const page of Object.keys(by).sort()) {
    console.log(`\n  ${page}`);
    for (const r of by[page]) console.log(`    ${mark} ${r.rule.padEnd(16)} ${r.msg}`);
  }
};

console.log(`site standard â€” ${pages.length} pages checked`);
print('WARN', warn, '~');
print('FAIL', fail, 'âœ—');

if (!fail.length && !warn.length) console.log('\nclean.');
else console.log(`\n${fail.length} failing, ${warn.length} warnings`);

process.exit(fail.length ? 1 : 0);
