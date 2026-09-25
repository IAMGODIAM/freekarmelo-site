/*!
 * event-promo.js — promote one upcoming event across the site from its manifest.
 *
 *   <script src="/freekarmelo-shared/event-promo.js" data-event="/oct10/event.json"
 *           data-slots="strip band takeover next" defer></script>
 *
 * Nothing about the event is typed into the host page. Every word, date and link
 * comes from the event's JSON (the same file the event page renders from), so a
 * change there reaches the homepage and /events on the next load.
 *
 * Slots (only the ones named in data-slots run; each needs its mount, if any):
 *   strip     top announcement bar          → <div data-promo="strip"></div>
 *   band      full-width feature band       → <div data-promo="band"></div>
 *   next      rewrite /events "next public event" card (#fkNextName …), no countdown
 *   takeover  one-time invitation dialog, once per visitor (never for webdriver, ?nopopup)
 *
 * Lifecycle: shows while the event is upcoming or today; everything removes itself
 * once `end` has passed or status is "past". No countdowns, ever (freekarmelo-guardrails).
 */
(function () {
  var me = document.currentScript;
  var SRC = (me && me.getAttribute('data-event')) || '/oct10/event.json';
  var SLOTS = ((me && me.getAttribute('data-slots')) || 'strip band').split(/\s+/);
  var has = function (s) { return SLOTS.indexOf(s) > -1; };

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var track = function (name, p) { try { if (typeof gtag === 'function') gtag('event', name, p || {}); } catch (e) {} };
  var chiDay = function (t) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(t)); };

  function phase(E) {
    var now = Date.now();
    if (E.status === 'past' || now > Date.parse(E.end)) return 'past';
    if (chiDay(now) === chiDay(E.start)) return 'today';
    return 'upcoming';
  }

  function fonts() {
    if (document.querySelector('link[data-promo-fonts]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.setAttribute('data-promo-fonts', '');
    l.href = 'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Archivo+Black&family=IBM+Plex+Mono:wght@500;600&display=swap';
    document.head.appendChild(l);
  }

  function css() {
    if (document.getElementById('promo-css')) return;
    var s = document.createElement('style'); s.id = 'promo-css';
    s.textContent = [
      '.pr{--ink:#0B0710;--paper:#F4EFE4;--purple:#4B2FA0;--gold:#D9B36C;--gold-lift:#F0DCAC;--gold-dark:#7A5A14;--red:#9A2E2E;font-family:Archivo,system-ui,sans-serif;-webkit-font-smoothing:antialiased}',
      '.pr *{box-sizing:border-box}',
      /* strip */
      '.pr-strip{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 14px;padding:11px 16px;background:var(--paper);color:var(--ink);text-decoration:none;border-bottom:4px solid var(--gold-dark);text-align:center;line-height:1.35}',
      '.pr-strip:hover{background:#fff}',
      '.pr-strip b{font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:12px;letter-spacing:.18em;color:var(--purple)}',
      '.pr-strip strong{font-family:"Archivo Black",Archivo,sans-serif;font-weight:400;font-size:15px;letter-spacing:.01em;text-transform:uppercase}',
      '.pr-strip span{font-size:14px;font-weight:600;color:#3A3340}',
      '.pr-strip i{font-style:normal;font-weight:800;font-size:14px;color:var(--purple);white-space:nowrap}',
      '.pr-strip.today{background:var(--purple);color:var(--paper);border-color:var(--gold)}.pr-strip.today b,.pr-strip.today i{color:var(--gold-lift)}.pr-strip.today span{color:#E6DFD2}',
      /* band */
      '.pr-band{background:var(--paper);color:var(--ink);border-top:5px solid var(--gold-dark);border-bottom:5px solid var(--gold-dark);overflow:hidden}',
      '.pr-band .w{max-width:1160px;margin:0 auto;padding:clamp(34px,5vw,64px) clamp(16px,4vw,40px);display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.9fr);gap:clamp(28px,4vw,56px);align-items:center}',
      '@media(max-width:860px){.pr-band .w{grid-template-columns:1fr}.pr-band .art{order:-1;max-width:420px;justify-self:center}}',
      '.pr-band .eb{font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:13px;letter-spacing:.22em;color:var(--purple);text-transform:uppercase;display:block;margin-bottom:14px}',
      '.pr-band h2{margin:0;font-family:"Archivo Black",Archivo,sans-serif;font-weight:400;font-size:clamp(40px,7vw,92px);line-height:.9;letter-spacing:-.02em;text-transform:uppercase;color:var(--ink)}',
      '.pr-band h2 em{font-style:normal;color:var(--purple)}',
      '.pr-band .when{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 18px;margin:22px 0 6px;padding:14px 0;border-top:3px solid var(--ink);border-bottom:1px solid rgba(11,7,16,.2)}',
      '.pr-band .when .d{font-family:"Archivo Black",Archivo,sans-serif;font-size:clamp(24px,3.2vw,34px);line-height:1}',
      '.pr-band .when .t{font-family:"Archivo Black",Archivo,sans-serif;font-size:clamp(18px,2.2vw,24px);color:var(--purple)}',
      '.pr-band .where{font-weight:700;font-size:18px;margin:10px 0 0}.pr-band .where small{display:block;font-family:"IBM Plex Mono",monospace;font-weight:500;font-size:13px;color:#3A3340;margin-top:3px}',
      '.pr-band .hl{margin:18px 0 0;font-size:17px;line-height:1.6;color:#3A3340;max-width:620px}',
      '.pr-band .hl b{font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:11px;letter-spacing:.18em;color:var(--purple);margin-right:6px}',
      '.pr-band .hl span{white-space:nowrap}.pr-band .hl span+span:before{content:"·";margin:0 10px;color:var(--gold-dark)}',
      '.pr-band .stamp{display:inline-block;margin-top:20px;transform:rotate(-2deg);border:3px solid var(--red);outline:1px solid var(--red);outline-offset:4px;padding:8px 14px;font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:13px;letter-spacing:.12em;color:var(--red);text-transform:uppercase}',
      '.pr-band .ctas{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}',
      '.pr-btn{display:inline-block;text-decoration:none;font-family:Archivo,sans-serif;font-weight:800;font-size:16px;padding:14px 22px;border:2px solid var(--ink);color:var(--ink);background:transparent;cursor:pointer;border-radius:0;line-height:1.2}',
      '.pr-btn:hover{background:var(--ink);color:var(--paper)}',
      '.pr-btn.p{background:var(--purple);border-color:var(--purple);color:var(--paper)}.pr-btn.p:hover{background:var(--ink);border-color:var(--ink)}',
      '.pr-band .art{display:block;position:relative;justify-self:end;width:100%;max-width:440px;transform:rotate(1.4deg);box-shadow:0 1px 0 rgba(11,7,16,.25),10px 12px 0 var(--ink)}',
      '.pr-band .art img{display:block;width:100%;height:auto;border:2px solid var(--ink)}',
      '.pr-band .fine{margin:16px 0 0;font-family:"IBM Plex Mono",monospace;font-size:12px;color:#3A3340}',
      /* takeover */
      '.pr-tk{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(11,7,16,.78)}',
      '.pr-tk[data-open]{display:flex}',
      '.pr-tk .c{position:relative;width:min(860px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--paper);color:var(--ink);border-top:6px solid var(--gold-dark);display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1fr)}',
      '.pr-tk .a{display:block;background:#DCD5C7}.pr-tk .a img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}',
      '.pr-tk .b{padding:30px 28px 26px;display:flex;flex-direction:column;gap:12px}',
      '.pr-tk h2{margin:0;font-family:"Archivo Black",Archivo,sans-serif;font-weight:400;font-size:clamp(30px,4.6vw,44px);line-height:.95;text-transform:uppercase}',
      '.pr-tk h2 em{font-style:normal;color:var(--purple)}',
      '.pr-tk .eb{font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:12px;letter-spacing:.2em;color:var(--purple)}',
      '.pr-tk p{margin:0;font-size:16px;line-height:1.55;color:#3A3340}',
      '.pr-tk .x{position:absolute;top:10px;right:10px;width:40px;height:40px;border:2px solid var(--ink);background:var(--paper);color:var(--ink);font-size:18px;cursor:pointer}',
      '.pr-tk .stay{background:none;border:0;padding:4px 0;text-align:left;cursor:pointer;font-family:"IBM Plex Mono",monospace;font-size:12px;color:#3A3340;text-decoration:underline}',
      '@media(max-width:720px){.pr-tk .c{grid-template-columns:1fr}.pr-tk .a{display:none}.pr-tk .b{padding-top:56px}}',
      '.pr-tk :focus-visible,.pr :focus-visible{outline:3px solid var(--gold);outline-offset:2px}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function nameHTML(n) { var w = String(n).split(' '); return esc(w.slice(0, -1).join(' ')) + ' <em>' + esc(w[w.length - 1]) + '</em>'; }
  function page(E, hash, src) { var u = new URL(E.url.replace(/\/?$/, '/')); return u.pathname + '?utm_source=' + src + '&utm_medium=site&utm_campaign=oct10' + (hash || ''); }
  function art(E, id) { var a = E.assets.filter(function (x) { return x.id === id; })[0] || E.assets[0]; return a; }
  function thumb(p) { return '/' + p.replace(/^\//, '').replace(/\/([^\/]+)\.png$/, '/thumbs/$1.jpg'); }

  function strip(E, ph, host) {
    var el = document.querySelector('[data-promo="strip"]'); if (!el) return;
    var v = E.venue;
    var lead = ph === 'today' ? 'HAPPENING TODAY · ' + E.timeLabel.toUpperCase() : E.dateShort + ' · ' + v.city.toUpperCase();
    el.innerHTML = '<a class="pr pr-strip' + (ph === 'today' ? ' today' : '') + '" href="' + page(E, ph === 'today' ? '' : '#rsvp', host + '_strip') + '">' +
      '<b>' + esc(lead) + '</b><strong>' + esc(E.name) + '</strong><span>' + esc(E.tagline) + '</span><i>' + (ph === 'today' ? 'Directions &amp; program →' : 'RSVP →') + '</i></a>';
    el.querySelector('a').addEventListener('click', function () { track('select_promotion', { promotion_id: E.slug, creative_slot: host + '_strip' }); });
  }

  function band(E, ph, host) {
    var el = document.querySelector('[data-promo="band"]'); if (!el) return;
    var v = E.venue, a = art(E, 'feed');
    var hl = E.highlights.map(function (h) { return '<span><b>' + esc(h.k) + '</b>' + esc(h.v) + '</span>'; }).join(' ');
    var feat = E.featured && E.featured.confirmed ? '<span class="stamp">Featuring ' + esc(E.featured.name) + '</span>' : '';
    el.innerHTML = '<section class="pr pr-band" aria-labelledby="pr-band-h"><div class="w">' +
      '<div><span class="eb">' + esc(ph === 'today' ? 'Happening today · ' + v.city : E.umbrella + ' · ' + v.city) + '</span>' +
      '<h2 id="pr-band-h">' + nameHTML(E.name) + '</h2>' +
      '<div class="when"><span class="d">' + esc(E.dateLong) + '</span><span class="t">' + esc(E.timeLabel) + '</span></div>' +
      '<p class="where">' + esc(v.name) + '<small>' + esc(v.street + ', ' + v.city + ', ' + v.region + (v.aka ? ' · ' + v.aka : '')) + '</small></p>' +
      '<p class="hl">' + hl + '</p>' + feat +
      '<div class="ctas"><a class="pr-btn p" data-c="rsvp" href="' + page(E, '#rsvp', host + '_band') + '">I’m coming — RSVP</a>' +
      '<a class="pr-btn" data-c="youth" href="' + page(E, '#youth', host + '_band') + '">Register a youth team</a>' +
      '<a class="pr-btn" data-c="kit" href="' + page(E, '#share', host + '_band') + '">Get the flyers</a>' +
      '<button type="button" class="pr-btn" data-c="share">Share</button></div>' +
      '<p class="fine">' + esc(E.posture) + '</p></div>' +
      '<a class="art" data-c="art" href="' + page(E, '', host + '_band') + '"><img src="' + thumb(a.png) + '" alt="' + esc(a.alt) + '" width="' + a.w + '" height="' + a.h + '" loading="lazy" decoding="async"></a>' +
      '</div></section>';
    el.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-c]'); if (!t) return;
      var c = t.getAttribute('data-c');
      track('select_promotion', { promotion_id: E.slug, creative_slot: host + '_band', creative_name: c });
      if (c === 'share') {
        var link = 'https://' + E.shortUrl + '?utm_source=' + host + '_share&utm_medium=share&utm_campaign=oct10';
        if (navigator.share) navigator.share({ title: E.name, text: E.shareText, url: link }).catch(function () {});
        else { try { navigator.clipboard.writeText(E.shareText + ' ' + link); t.textContent = 'Link copied ✓'; setTimeout(function () { t.textContent = 'Share'; }, 2200); } catch (e) {} }
      }
    });
  }

  function next(E, ph) {
    var n = document.getElementById('fkNextName'); if (!n) return;
    var card = n.parentNode;
    n.textContent = E.name;
    var d = document.getElementById('fkNextDate');
    if (d) d.textContent = (E.dateLong + ' · ' + E.timeLabel + ' · ' + E.venue.name + ', ' + E.venue.city).toUpperCase();
    var cd = document.getElementById('fkCdD'); if (cd) { var g = cd.closest('div[style*="grid"]'); if (g) g.style.display = 'none'; }
    var ics = document.getElementById('fkIcsNext');
    if (ics) {
      var a = document.createElement('a');
      a.id = 'fkIcsNext'; a.className = ics.className; a.setAttribute('style', ics.getAttribute('style') + ';text-align:center;text-decoration:none;display:block');
      a.href = page(E, '#rsvp', 'events_next'); a.textContent = ph === 'today' ? 'HAPPENING TODAY →' : 'RSVP · EVENT PAGE';
      ics.parentNode.replaceChild(a, ics);
    }
    var st = card.lastElementChild;
    if (st && /STATUS/.test(st.textContent)) st.innerHTML = 'STATUS · <span style="color:#E3C88F">CONFIRMED · FREE · ALL AGES</span><br>' + esc(E.posture.toUpperCase());
  }

  function takeover(E, ph, host) {
    if (ph !== 'upcoming' && ph !== 'today') return;
    if (/[?&]nopopup/.test(location.search) || navigator.webdriver) return;
    var KEY = 'fk_takeover_' + E.slug;
    try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }
    var a = art(E, 'feed');
    var wrap = document.createElement('div');
    wrap.className = 'pr pr-tk'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'pr-tk-h');
    wrap.innerHTML = '<div class="c"><button type="button" class="x" aria-label="Close">✕</button>' +
      '<a class="a" href="' + page(E, '', host + '_takeover') + '" data-go><img src="' + thumb(a.png) + '" alt="' + esc(a.alt) + '" width="' + a.w + '" height="' + a.h + '"></a>' +
      '<div class="b"><span class="eb">' + esc((ph === 'today' ? 'TODAY · ' : '') + E.dateLong.toUpperCase() + ' · ' + E.venue.city.toUpperCase()) + '</span>' +
      '<h2 id="pr-tk-h">' + nameHTML(E.name) + '</h2>' +
      '<p>' + esc(E.purpose) + '</p>' +
      '<p><b>' + esc(E.timeLabel) + '</b> · ' + esc(E.venue.name) + '. ' + esc(E.tagline) + '</p>' +
      '<a class="pr-btn p" data-go href="' + page(E, '#rsvp', host + '_takeover') + '">I’m coming — RSVP</a>' +
      '<button type="button" class="stay">Not now — stay on this page</button></div></div>';
    document.body.appendChild(wrap);
    var last = null;
    function close(why) {
      wrap.removeAttribute('data-open'); document.documentElement.style.overflow = '';
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
      if (last && last.focus) last.focus();
      track('event_takeover', { promotion_id: E.slug, action: why });
    }
    wrap.querySelector('.x').onclick = function () { close('dismissed'); };
    wrap.querySelector('.stay').onclick = function () { close('stayed'); };
    wrap.querySelectorAll('[data-go]').forEach(function (g) { g.addEventListener('click', function () { close('went'); }); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close('dismissed'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && wrap.hasAttribute('data-open')) close('dismissed'); });
    setTimeout(function () { last = document.activeElement; wrap.setAttribute('data-open', ''); document.documentElement.style.overflow = 'hidden'; var go = wrap.querySelector('.pr-btn'); if (go) go.focus(); track('view_promotion', { promotion_id: E.slug, creative_slot: host + '_takeover' }); }, 1200);
  }

  function run(E) {
    var ph = phase(E);
    if (ph === 'past') return;
    var host = location.pathname === '/' ? 'home' : location.pathname.replace(/^\/|\/$|\.html$/g, '').replace(/\W+/g, '_') || 'site';
    fonts(); css();
    if (has('strip')) strip(E, ph, host);
    if (has('band')) band(E, ph, host);
    if (has('next')) next(E, ph);
    if (has('takeover')) takeover(E, ph, host);
    track('view_promotion', { promotion_id: E.slug, creative_slot: host, phase: ph });
  }

  function go() { fetch(SRC, { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(run).catch(function () {}); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
