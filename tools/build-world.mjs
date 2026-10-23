// Natural Earth GeoJSON(110m + 한반도 50m) → data/world.json (등장방형 투영된 SVG path)
// 사용: node tools/build-world.mjs <110m.json> <50m.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [f110, f50] = process.argv.slice(2);
if (!f110 || !f50) { console.error('usage: build-world.mjs <110m.json> <50m.json>'); process.exit(1); }
const W = 360, H = 180;
const r1 = (n, p) => Number(n.toFixed(p));
const proj = ([lon, lat], p) => `${r1(lon + 180, p)} ${r1(90 - lat, p)}`;

function ringPath(ring, p) {
  let d = '', last = null;
  for (const pt of ring) {
    const s = proj(pt, p);
    if (s === last) continue;
    d += (last === null ? 'M' : 'L') + s;
    last = s;
  }
  return d + 'Z';
}
function geomPath(g, p) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((poly) => poly.map((r) => ringPath(r, p)).join('')).join('');
}
const load = (f) => JSON.parse(readFileSync(f, 'utf8')).features;
const a3 = (ft) => ft.properties.ADM0_A3;
const KOREA = new Set(['KOR', 'PRK']);

const out = [];
for (const ft of load(f110)) {
  if (a3(ft) === 'ATA' || KOREA.has(a3(ft))) continue;
  out.push({ id: a3(ft), name: ft.properties.NAME, d: geomPath(ft.geometry, 1) });
}
for (const ft of load(f50)) {
  if (KOREA.has(a3(ft))) out.push({ id: a3(ft), name: ft.properties.NAME, d: geomPath(ft.geometry, 2) });
}
writeFileSync(new URL('../data/world.json', import.meta.url), JSON.stringify({ w: W, h: H, countries: out }));
console.log(`countries ${out.length}`);
