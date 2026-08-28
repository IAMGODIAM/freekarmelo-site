/* City-sheet background layer — rendered on the GPU through vgpu/Dawn.
   Headless: no browser, no graphics card required (a cached CPU renderer
   covers GPU-less servers). Each city gets a field seeded from its slug, so
   no two sheets share a background while all stay inside the campaign palette.

   Deliberately restrained: the typography is the hero on these sheets, so the
   field never exceeds roughly 0.18 luminance except in the corners. */
import { init, effect, target } from 'vgpu/node';
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

export const BG_WGSL = /* wgsl */ `
struct U { seed: f32, warm: f32, aspect: f32, _pad: f32 };
@group(0) @binding(0) var<uniform> u: U;

const GOLD   = vec3f(0.851, 0.702, 0.424);
const VIOLET = vec3f(0.545, 0.361, 0.965);
const LILAC  = vec3f(0.788, 0.698, 1.000);
const INK    = vec3f(0.031, 0.020, 0.063);

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
fn noise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1,0)), w.x),
             mix(hash(i + vec2f(0,1)), hash(i + vec2f(1,1)), w.x), w.y);
}
fn fbm(p0: vec2f) -> f32 {
  var s = 0.0; var a = 0.5; var p = p0;
  for (var i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let o = vec2f(u.seed * 13.7, u.seed * 7.3);
  let p = vec2f(uv.x * u.aspect, uv.y) * 2.1 + o;

  var col = INK;

  // nebula: two offset fbm lobes, kept low so type stays dominant
  let n1 = fbm(p + vec2f(fbm(p * 1.6), fbm(p * 1.9 + 3.0)));
  let n2 = fbm(p * 0.7 + 11.0);
  col += VIOLET * 0.115 * smoothstep(0.30, 0.95, n1);
  col += LILAC  * 0.045 * smoothstep(0.45, 1.00, n2);

  // a cool wash down the top edge, where the eyebrow and wordmark sit
  col += VIOLET * 0.055 * smoothstep(0.55, 0.0, uv.y);

  // warm corner — rotates around the sheet per city via u.warm
  let wc = vec2f(0.5 + 0.42 * cos(u.warm * 6.2831), 0.5 + 0.42 * sin(u.warm * 6.2831));
  col += GOLD * 0.085 * exp(-distance(vec2f(uv.x * u.aspect, uv.y), vec2f(wc.x * u.aspect, wc.y)) * 3.1);

  // faint lattice, echoing the globe on the site
  let g = abs(fract(uv * vec2f(46.0 * u.aspect, 46.0)) - 0.5);
  let dots = smoothstep(0.46, 0.5, g.x) * smoothstep(0.46, 0.5, g.y);
  col += LILAC * 0.030 * dots;

  // vignette holds the edges down so white type never fights the field
  col *= 1.0 - 0.42 * pow(distance(uv, vec2f(0.5)) * 1.28, 2.0);

  return vec4f(col, 1.0);
}`;

/* slug -> stable 0..1 pair, so a city's sheet looks the same every rebuild */
export function seedFor(slug) {
  let h = 2166136261;
  for (const ch of String(slug)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const a = ((h >>> 0) % 100000) / 100000;
  const b = ((Math.imul(h, 2654435761) >>> 0) % 100000) / 100000;
  return [a, b];
}

let _gpu = null;
/* one Dawn device for the whole run -- re-initialising per city is the
   difference between seconds and minutes on a --all rebuild */
export async function gpuOnce() {
  if (!_gpu) _gpu = await init();
  return _gpu;
}

export async function renderBackground({ slug, width, height, out, gpu: given }) {
  const [seed, warm] = seedFor(slug);
  const gpu = given || await gpuOnce();
  const tgt = target(gpu, { size: [width, height] });
  effect(gpu, BG_WGSL, { set: { u: { seed, warm, aspect: width / height, _pad: 0 } } }).draw(tgt);
  const px = await tgt.read();
  const png = new PNG({ width, height });
  png.data = Buffer.from(px.buffer, px.byteOffset, px.byteLength);
  writeFileSync(out, PNG.sync.write(png));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [slug = 'detroit', out = 'bg.png'] = process.argv.slice(2);
  await renderBackground({ slug, width: 1080, height: 1350, out });
  console.log('background ->', out);
  process.exit(0);
}
