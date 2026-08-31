# -*- coding: utf-8 -*-
"""Append an org-identity strip before </body> on every content page, and add
/about + /privacy to the sitemap. Idempotent (skips pages carrying the EIN).
Dry-run unless --apply. Print sheets and the moderation console are excluded
so the strip never lands on a printable flyer."""
import io, os, sys

os.chdir(os.path.join(os.path.dirname(__file__), '..'))
APPLY = '--apply' in sys.argv
EIN = 'EIN 99-3822441'
EXCLUDE = {'flyer.html', 'events-flyer.html', 'hearings-flyers.html',
           'solidarity/moderate.html', '_template/page.html'}

A = ' style="color:#b393c9;text-decoration:underline;"'
BLOCK = ('\n<!-- org identity: required for Ad Grants website policy -->\n'
 '<div class="fk-orgline" style="background:#0d0618;border-top:1px solid '
 'rgba(155,89,182,.25);padding:18px 20px 22px;text-align:center;'
 "font:12px/1.8 'JetBrains Mono',Consolas,monospace;color:#8a7f96;\">\n"
 '  freekarmelo.net is a campaign of <a href="https://e5enclave.com/about/"'
 + A + '>E5 Enclave Incorporated</a>, a 501(c)(3) public charity '
 '&middot; ' + EIN + '<br>\n'
 '  <a href="/about"' + A + '>About this site</a> &middot; '
 '<a href="/privacy"' + A + '>Privacy</a> &middot; '
 '<a href="https://e5enclave.com/contact/"' + A + '>Contact</a> &middot; '
 '<a href="https://e5enclave.com/donate/"' + A + '>Donate</a>\n'
 '</div>\n</body>')

hit, skip, excl, nobody = [], [], [], []
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', 'assets',
                                            'freekarmelo-shared', 'tools')]
    for f in files:
        if not f.endswith('.html'):
            continue
        p = os.path.relpath(os.path.join(root, f)).replace('\\', '/')
        if p in EXCLUDE:
            excl.append(p); continue
        s = io.open(p, encoding='utf-8').read()
        if EIN in s:
            skip.append(p); continue
        if '</body>' not in s:
            nobody.append(p); continue
        s2 = s.replace('</body>', BLOCK, 1)
        hit.append(p)
        if APPLY:
            io.open(p, 'w', encoding='utf-8', newline='\n').write(s2)

print('strip added %d | already had EIN %d | excluded %d | no </body> %d'
      % (len(hit), len(skip), len(excl), len(nobody)))
for p in hit:
    print('  +', p)
for p in skip:
    print('  =', p)
for p in nobody:
    print('  !', p)

sm = io.open('sitemap.xml', encoding='utf-8').read()
add = []
for slug in ('about', 'privacy'):
    u = 'https://freekarmelo.net/%s' % slug
    if u + '<' not in sm:
        add.append('  <url><loc>%s</loc><lastmod>2026-08-31</lastmod></url>' % u)
if add and APPLY:
    sm = sm.replace('</urlset>', '\n'.join(add) + '\n</urlset>')
    io.open('sitemap.xml', 'w', encoding='utf-8', newline='\n').write(sm)
print('sitemap additions:', len(add), '(applied)' if APPLY else '(dry-run)')
