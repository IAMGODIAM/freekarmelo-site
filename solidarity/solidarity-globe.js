/* <solidarity-globe> — interactive 3D globe of the 8/29–8/30 Worldwide Solidarity Weekend roster.
   No build step. three.js arrives via dynamic import (no import map needed).
   Land dots are sampled from real world-atlas geometry; if that fetch fails the
   lattice globe still renders, so the hero never goes blank.

   Props (attributes or properties):
     cities   JSON array of {name, region, slug, lat, lng, tier}  tier: "anchor" | "city" | "intl"
   Events:
     city-select  detail:{slug, name}   — fired on pin click
   Methods:
     focusCity(slug)  spins the globe so that city faces the camera
*/
(() => {
  if (window.__solidarityGlobeDefined) return;
  window.__solidarityGlobeDefined = true;

  const GOLD = 0xD9B36C, PURPLE = 0x8B5CF6, LILAC = 0xC9B2FF, INK = 0x0B0713;

  const DEFAULT_CITIES = [
    { name: 'McKinney', region: 'TX · COURTHOUSE', slug: 'mckinney', lat: 33.198, lng: -96.615, tier: 'anchor' },
    { name: 'Atlanta', region: 'GA', slug: 'atlanta', lat: 33.749, lng: -84.388, tier: 'city' },
    { name: 'DeKalb', region: 'GA', slug: 'dekalb', lat: 33.771, lng: -84.230, tier: 'city' },
    { name: 'Houston', region: 'TX', slug: 'houston', lat: 29.760, lng: -95.369, tier: 'city' },
    { name: 'Dallas', region: 'TX', slug: 'dallas', lat: 32.777, lng: -96.797, tier: 'city' },
    { name: 'Chicago', region: 'IL', slug: 'chicago', lat: 41.878, lng: -87.630, tier: 'city' },
    { name: 'Evanston', region: 'IL', slug: 'evanston', lat: 42.045, lng: -87.688, tier: 'city' },
    { name: 'Gary', region: 'IN', slug: 'gary', lat: 41.593, lng: -87.346, tier: 'city' },
    { name: 'Kenosha', region: 'WI', slug: 'kenosha', lat: 42.585, lng: -87.821, tier: 'city' },
    { name: 'New Orleans', region: 'LA', slug: 'new-orleans', lat: 29.951, lng: -90.072, tier: 'city' },
    { name: 'Baton Rouge', region: 'LA', slug: 'baton-rouge', lat: 30.451, lng: -91.187, tier: 'city' },
    { name: 'Miami', region: 'FL', slug: 'miami', lat: 25.762, lng: -80.192, tier: 'city' },
    { name: 'Tampa', region: 'FL', slug: 'tampa', lat: 27.951, lng: -82.457, tier: 'city' },
    { name: 'Bradenton', region: 'FL', slug: 'bradenton', lat: 27.499, lng: -82.575, tier: 'city' },
    { name: 'New York City', region: 'NY', slug: 'nyc', lat: 40.713, lng: -74.006, tier: 'city' },
    { name: 'Buffalo', region: 'NY', slug: 'buffalo', lat: 42.886, lng: -78.878, tier: 'city' },
    { name: 'Boston', region: 'MA', slug: 'boston', lat: 42.360, lng: -71.059, tier: 'city' },
    { name: 'Twin Cities', region: 'MN', slug: 'twin-cities', lat: 44.978, lng: -93.265, tier: 'city' },
    { name: 'Oakland', region: 'CA', slug: 'oakland', lat: 37.804, lng: -122.271, tier: 'city' },
    { name: 'Los Angeles', region: 'CA', slug: 'los-angeles', lat: 34.052, lng: -118.244, tier: 'city' },
    { name: 'Santa Clarita', region: 'CA', slug: 'santa-clarita', lat: 34.391, lng: -118.542, tier: 'city' },
    { name: 'Boise', region: 'ID', slug: 'boise', lat: 43.615, lng: -116.202, tier: 'city' },
    { name: 'Accra', region: 'GHANA', slug: 'accra', lat: 5.604, lng: -0.187, tier: 'intl' },
    { name: 'Stockholm', region: 'SWEDEN', slug: 'stockholm', lat: 59.329, lng: 18.069, tier: 'intl' }
  ];

  const ARCS = [['mckinney', 'accra'], ['mckinney', 'stockholm'], ['mckinney', 'oakland'], ['mckinney', 'nyc'], ['accra', 'stockholm']];

  const CSS = `
    :host{display:block;position:relative;width:100%;height:100%;min-height:420px;touch-action:pan-y}
    .stage{position:absolute;inset:0;overflow:hidden}
    canvas{display:block;width:100%;height:100%;cursor:grab}
    canvas.dragging{cursor:grabbing}
    canvas.over{cursor:pointer}
    .labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
    .lbl{position:absolute;transform:translate(10px,-50%);white-space:nowrap;
      font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.14em;
      color:#C9B2FF;text-shadow:0 1px 6px rgba(8,5,16,.95);transition:color .18s,font-size .18s;will-change:transform}
    .lbl b{font-weight:500}
    .lbl i{font-style:normal;color:#6E6284;margin-left:6px}
    .lbl.anchor{color:#F0DCAC;font-size:11px;letter-spacing:.18em}
    .lbl.hot{color:#F7F3FB;font-size:13px}
    .lbl.hot i{color:#D9B36C}
    .hint{position:absolute;left:0;bottom:0;display:flex;gap:16px;align-items:center;
      font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.22em;color:#5E5273;pointer-events:none}
    .hint span{display:flex;align-items:center;gap:7px}
    .dotk{width:5px;height:5px;border-radius:50%;background:#D9B36C;box-shadow:0 0 8px #D9B36C}
    /* The boot notice is a status overlay, never an input target. Without
       pointer-events:none it keeps covering the canvas after it fades, and
       every drag and pin click lands on an invisible div instead of the globe. */
    .boot{position:absolute;inset:0;display:grid;place-items:center;font-family:'IBM Plex Mono',ui-monospace,monospace;
      font-size:10px;letter-spacing:.28em;color:#4A4060;transition:opacity .6s;pointer-events:none}
    .boot.gone{opacity:0}
    @media (prefers-reduced-motion:reduce){.dotk{box-shadow:none}}
  `;

  class SolidarityGlobe extends HTMLElement {
    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style><div class="stage"><canvas></canvas><div class="labels"></div>
        <div class="hint"><span><i class="dotk"></i>DRAG TO SPIN</span><span>CLICK A CITY</span></div>
        <div class="boot">PLOTTING THE ROSTER</div></div>`;
      this.$canvas = root.querySelector('canvas');
      this.$labels = root.querySelector('.labels');
      this.$boot = root.querySelector('.boot');
      this.boot().catch(e => { console.warn('[solidarity-globe]', e); this.$boot.textContent = 'MAP UNAVAILABLE — THE ROSTER IS BELOW'; });
    }

    get cities() {
      if (this._cities) return this._cities;
      const raw = this.getAttribute('cities');
      if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return (this._cities = p); } catch (e) { /* fall through */ } }
      return (this._cities = DEFAULT_CITIES);
    }
    set cities(v) { this._cities = v; }

    async boot() {
      /* Prefer a copy already on the page (self-hosted vendor script, or an
         inlined build). Falls back to the CDN so a bare drop-in still works. */
      const THREE = globalThis.THREE ||
        await import('https://unpkg.com/three@0.160.0/build/three.module.js');
      this.THREE = THREE;
      const canvas = this.$canvas;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      camera.position.set(0, 0, 3.15);
      const globe = new THREE.Group();
      globe.rotation.set(0.26, 0.10, 0.04);
      scene.add(globe);
      this.renderer = renderer; this.scene = scene; this.camera = camera; this.globe = globe;

      const toVec = (lat, lng, r = 1) => {
        const phi = (90 - lat) * Math.PI / 180, theta = (lng + 180) * Math.PI / 180;
        return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      };
      this._toVec = toVec;

      /* ── body: unlit dark sphere with a purple/gold fresnel rim ── */
      globe.add(new THREE.Mesh(new THREE.SphereGeometry(0.998, 96, 96), new THREE.ShaderMaterial({
        uniforms: { cInk: { value: new THREE.Color(0x120A20) }, cRim: { value: new THREE.Color(PURPLE) }, cWarm: { value: new THREE.Color(GOLD) } },
        vertexShader: `varying vec3 vN; varying vec3 vL;
          void main(){ vN = normalize(normalMatrix*normal); vL = normalize(position);
          gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform vec3 cInk,cRim,cWarm; varying vec3 vN; varying vec3 vL;
          void main(){ float f = pow(max(0.0, 1.0-abs(dot(normalize(vN),vec3(0.,0.,1.)))),3.0);
            float warm = smoothstep(-0.2,0.9,vL.y);
            vec3 rim = mix(cRim,cWarm,warm*0.55);
            gl_FragColor = vec4(cInk + rim*f*1.35, 1.0);}`
      })));

      /* ── atmosphere ── */
      globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.19, 64, 64), new THREE.ShaderMaterial({
        transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
        uniforms: { cRim: { value: new THREE.Color(PURPLE) } },
        vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform vec3 cRim; varying vec3 vN;
          void main(){ float f=pow(max(0.0, 0.62-abs(dot(normalize(vN),vec3(0.,0.,1.)))),3.2);
            gl_FragColor=vec4(cRim, clamp(f,0.0,1.0)*1.7);}`
      })));

      /* ── lat/long lattice ── */
      const lat = [], lon = [];
      for (let a = -80; a <= 80; a += 20) for (let t = 0; t < 360; t += 3) {
        lat.push(toVec(a, t, 1.001), toVec(a, t + 3, 1.001));
      }
      for (let t = 0; t < 360; t += 20) for (let a = -90; a < 90; a += 3) {
        lon.push(toVec(a, t, 1.001), toVec(a + 3, t, 1.001));
      }
      const latticeMat = new THREE.LineBasicMaterial({ color: PURPLE, transparent: true, opacity: 0.22, depthWrite: false });
      globe.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lat), latticeMat));
      globe.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lon), latticeMat));
      const eq = []; for (let t = 0; t < 360; t += 2) eq.push(toVec(0, t, 1.003), toVec(0, t + 2, 1.003));
      globe.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(eq),
        new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.34, depthWrite: false })));

      /* ── starfield ── */
      const sp = [];
      for (let i = 0; i < 620; i++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 9 + Math.random() * 9, s = Math.sqrt(1 - u * u);
        sp.push(r * s * Math.cos(th), r * u, r * s * Math.sin(th));
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xC9B2FF, size: 0.035, transparent: true, opacity: 0.5, depthWrite: false })));

      /* ── arcs between anchors ── */
      const byId = {}; this.cities.forEach(c => byId[c.slug] = c);
      this.travelers = [];
      const travGeo = new THREE.BufferGeometry();
      travGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ARCS.length * 3), 3));
      ARCS.forEach(([a, b], i) => {
        const A = byId[a], B = byId[b]; if (!A || !B) return;
        const va = toVec(A.lat, A.lng), vb = toVec(B.lat, B.lng);
        const alt = 1 + va.distanceTo(vb) * 0.30;
        const mid = va.clone().add(vb).normalize().multiplyScalar(alt);
        const curve = new THREE.CatmullRomCurve3([va, va.clone().lerp(mid, 0.5).normalize().multiplyScalar(1 + (alt - 1) * 0.7), mid, vb.clone().lerp(mid, 0.5).normalize().multiplyScalar(1 + (alt - 1) * 0.7), vb]);
        globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(90)),
          new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false })));
        this.travelers.push({ curve, t: i / ARCS.length });
      });
      this.travMesh = new THREE.Points(travGeo, new THREE.PointsMaterial({ color: 0xF0DCAC, size: 0.052, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      globe.add(this.travMesh);

      /* ── city pins ── */
      this.pins = [];
      const pinGeo = new THREE.SphereGeometry(0.0098, 12, 12);
      const ringGeo = new THREE.RingGeometry(0.016, 0.021, 32);
      this.cities.forEach(c => {
        const isAnchor = c.tier === 'anchor';
        const col = isAnchor ? 0xF0DCAC : (c.tier === 'intl' ? LILAC : GOLD);
        const pos = toVec(c.lat, c.lng, 1.006);
        const g = new THREE.Group();
        g.position.copy(pos);
        g.lookAt(pos.clone().multiplyScalar(2));
        const dot = new THREE.Mesh(pinGeo, new THREE.MeshBasicMaterial({ color: col }));
        if (isAnchor) dot.scale.setScalar(1.55);
        g.add(dot);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        g.add(ring);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, isAnchor ? 0.13 : 0.075, 6),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
        beam.rotation.x = Math.PI / 2;
        beam.position.z = (isAnchor ? 0.13 : 0.075) / 2;
        g.add(beam);
        globe.add(g);
        const el = document.createElement('div');
        el.className = 'lbl' + (isAnchor ? ' anchor' : '');
        el.innerHTML = `<b>${c.name.toUpperCase()}</b><i>${c.region}</i>`;
        this.$labels.appendChild(el);
        this.pins.push({ city: c, group: g, dot, ring, beam, el, phase: Math.random() * Math.PI * 2, hot: false });
      });

      /* ── land dots from real geometry (progressive; lattice stands if this fails) ── */
      this.landDots(THREE, globe, toVec).catch(e => console.warn('[solidarity-globe] land geometry unavailable:', e && e.message));

      this.bindInput();
      this.resize();
      this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(this);
      requestAnimationFrame(() => this.resize());
      setTimeout(() => this.resize(), 450);
      this.$boot.classList.add('gone');
      this.spin = { vy: 0.0005, vx: 0, idle: 0, drag: false };
      this.clock = new THREE.Clock();
      this.loop();
    }

    async landDots(THREE, globe, toVec) {
      /* Same deal for the land geometry: use a preloaded copy when the page
         supplies one, otherwise fetch it. Either way a failure here is caught
         upstream and the lattice globe still renders — the hero never blanks. */
      const topo = globalThis.__FK_LAND_110M ||
        (globalThis.__FK_LAND_110M_PROMISE && await globalThis.__FK_LAND_110M_PROMISE) ||
        await (await fetch('https://unpkg.com/world-atlas@2.0.2/land-110m.json')).json();
      const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
      const arc = i => { let x = 0, y = 0; return topo.arcs[i].map(d => { x += d[0]; y += d[1]; return [x * sx + tx, y * sy + ty]; }); };
      const ring = idxs => { let p = []; for (const i of idxs) { const rev = i < 0; let s = arc(rev ? ~i : i); if (rev) s = s.slice().reverse(); if (p.length) s = s.slice(1); p = p.concat(s); } return p; };
      const W = 1600, H = 800;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      const project = ([lng, la]) => [(lng + 180) / 360 * W, (90 - la) / 180 * H];
      const land = topo.objects.land;
      const geoms = land.type === 'GeometryCollection' ? land.geometries : [land];
      const polys = [];
      for (const g of geoms) {
        if (g.type === 'MultiPolygon') g.arcs.forEach(p => polys.push(p));
        else if (g.type === 'Polygon') polys.push(g.arcs);
      }
      for (const poly of polys) {
        ctx.beginPath();
        poly.forEach(r => { const pts = ring(r); pts.forEach((pt, i) => { const [x, y] = project(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); });
        ctx.fill('evenodd');
      }
      const data = ctx.getImageData(0, 0, W, H).data;
      const on = (la, lng) => { const x = Math.min(W - 1, Math.max(0, Math.round((lng + 180) / 360 * W))), y = Math.min(H - 1, Math.max(0, Math.round((90 - la) / 180 * H))); return data[(y * W + x) * 4] > 100; };
      const N = 46000, pos = [], col = [];
      const gold = new THREE.Color(0x8E74C8), warm = new THREE.Color(0xC9B2FF);
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399963;
        const la = Math.asin(y) * 180 / Math.PI, lng = ((th * 180 / Math.PI) % 360) - 180;
        if (!on(la, lng)) continue;
        const v = toVec(la, lng, 1.0045);
        pos.push(v.x, v.y, v.z);
        const c = gold.clone().lerp(warm, Math.random() * 0.8);
        col.push(c.r, c.g, c.b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      globe.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.0105, vertexColors: true, transparent: true, opacity: 1, depthWrite: false })));
    }

    bindInput() {
      const cv = this.$canvas, THREE = this.THREE;
      let last = null;
      const ndc = new THREE.Vector2(), ray = new THREE.Raycaster();
      ray.params.Points = { threshold: 0.03 };
      const pick = e => {
        const r = cv.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, this.camera);
        const hits = ray.intersectObjects(this.pins.map(p => p.dot), false);
        return hits.length ? this.pins.find(p => p.dot === hits[0].object) : null;
      };
      cv.addEventListener('pointerdown', e => {
        last = { x: e.clientX, y: e.clientY, moved: 0 };
        this.spin.drag = true; cv.classList.add('dragging'); cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', e => {
        if (last) {
          const dx = e.clientX - last.x, dy = e.clientY - last.y;
          last.moved += Math.abs(dx) + Math.abs(dy);
          this.globe.rotation.y += dx * 0.0055;
          this.globe.rotation.x = Math.max(-0.95, Math.min(0.95, this.globe.rotation.x + dy * 0.0040));
          this.spin.vy = dx * 0.0016; this.spin.vx = dy * 0.0010;
          last.x = e.clientX; last.y = e.clientY;
        } else {
          const p = pick(e);
          this.pins.forEach(q => q.hot = false);
          if (p) p.hot = true;
          cv.classList.toggle('over', !!p);
        }
      });
      const end = e => {
        cv.classList.remove('dragging');
        if (last && last.moved < 6) { const p = pick(e); if (p) this.select(p); }
        last = null; this.spin.drag = false; this.spin.idle = 0;
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', () => { last = null; this.spin.drag = false; cv.classList.remove('dragging'); });
      cv.addEventListener('pointerleave', () => { this.pins.forEach(q => q.hot = false); cv.classList.remove('over'); });
    }

    select(p) {
      this.focusCity(p.city.slug);
      this.dispatchEvent(new CustomEvent('city-select', { detail: { slug: p.city.slug, name: p.city.name }, bubbles: true, composed: true }));
    }

    focusCity(slug) {
      const p = this.pins.find(q => q.city.slug === slug);
      if (!p) return;
      const c = p.city;
      this.target = { y: Math.PI / 2 - (c.lng + 180) * Math.PI / 180, x: Math.max(-0.85, Math.min(0.85, c.lat * Math.PI / 180)) };
      const cur = this.globe.rotation.y, tau = Math.PI * 2;
      this.target.y = cur + ((this.target.y - cur) % tau + tau * 1.5) % tau - Math.PI;
      this.pins.forEach(q => q.hot = q === p);
      this.spin.idle = -2400;
    }

    resize() {
      const w = Math.max(240, this.clientWidth || 800), h = Math.max(300, this.clientHeight || 520);
      if (!this.renderer) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = w < 620 ? 44 : 36;
      this.camera.updateProjectionMatrix();
    }

    loop() {
      const THREE = this.THREE, dt = Math.min(0.05, this.clock.getDelta()), t = this.clock.elapsedTime;
      const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

      if (this.target) {
        this.globe.rotation.y += (this.target.y - this.globe.rotation.y) * 0.075;
        this.globe.rotation.x += (this.target.x - this.globe.rotation.x) * 0.075;
        if (Math.abs(this.target.y - this.globe.rotation.y) < 0.002) this.target = null;
      } else if (!this.spin.drag) {
        this.spin.idle += dt * 1000;
        this.globe.rotation.y += this.spin.vy;
        this.globe.rotation.x = Math.max(-0.95, Math.min(0.95, this.globe.rotation.x + this.spin.vx));
        this.spin.vx *= 0.93;
        const cruise = reduce ? 0 : 0.0005;
        this.spin.vy += ((this.spin.idle > 2200 ? cruise : this.spin.vy) - this.spin.vy) * 0.02;
        if (this.spin.idle > 2200) this.spin.vy += (cruise - this.spin.vy) * 0.03;
      }

      /* pins: pulse + project labels, hiding back-facing and colliding ones */
      const camDir = new THREE.Vector3(), v = new THREE.Vector3(), boxes = [];
      this.camera.getWorldDirection(camDir);
      const w = this.clientWidth, h = this.clientHeight;
      const ordered = this.pins.slice().sort((a, b) => (a.city.tier === 'anchor' ? -1 : b.city.tier === 'anchor' ? 1 : 0));
      for (const p of ordered) {
        const s = 1 + Math.sin(t * 1.7 + p.phase) * 0.10;
        p.ring.scale.setScalar((p.hot ? 1.9 : 1) * (0.9 + (reduce ? 0 : (Math.sin(t * 1.3 + p.phase) * 0.5 + 0.5) * 0.55)));
        p.ring.material.opacity = (p.hot ? 0.9 : 0.34) * (reduce ? 1 : (1 - ((Math.sin(t * 1.3 + p.phase) * 0.5 + 0.5) * 0.7)));
        p.dot.scale.setScalar((p.city.tier === 'anchor' ? 1.55 : 1) * (p.hot ? 1.9 : s));
        p.beam.material.opacity = p.hot ? 0.8 : 0.42;

        p.group.getWorldPosition(v);
        const facing = v.clone().normalize().dot(camDir.clone().negate());
        v.project(this.camera);
        const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
        const vis = facing > 0.22 && x > -40 && x < w + 40 && y > 0 && y < h;
        let show = vis;
        if (vis) {
          const bw = (p.el._w || (p.el._w = p.el.offsetWidth) || 96) + 16, bh = 17;
          for (const b of boxes) { if (x < b.x + b.w && x + bw > b.x && y - bh / 2 < b.y + b.h && y + bh / 2 > b.y) { show = p.hot; break; } }
          if (show) boxes.push({ x, y: y - bh / 2, w: bw, h: bh });
        }
        p.el.style.opacity = show ? String(Math.min(1, (facing - 0.22) * 4)) : '0';
        p.el.style.transform = `translate(${Math.round(x + 15)}px,${Math.round(y)}px) translateY(-50%)`;
        p.el.classList.toggle('hot', p.hot);
      }

      /* travelers along the arcs */
      if (this.travelers.length) {
        const arr = this.travMesh.geometry.attributes.position.array;
        this.travelers.forEach((tr, i) => {
          tr.t = (tr.t + (reduce ? 0 : dt * 0.14)) % 1;
          const pt = tr.curve.getPointAt(tr.t);
          arr[i * 3] = pt.x; arr[i * 3 + 1] = pt.y; arr[i * 3 + 2] = pt.z;
        });
        this.travMesh.geometry.attributes.position.needsUpdate = true;
      }

      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(() => this.loop());
    }

    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      if (this.renderer) this.renderer.dispose();
    }
  }
  customElements.define('solidarity-globe', SolidarityGlobe);
})();
