// data-src/wave*.mjs → data/destinations.json  사용: node tools/build-data.mjs
import { readdirSync, writeFileSync } from 'node:fs';
const dir = new URL('../data-src/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^wave\d+-.*\.mjs$/.test(f)).sort();
const all = [];
for (const f of files) { const m = await import(new URL(f, dir)); all.push(...m.default); }
writeFileSync(new URL('../data/destinations.json', import.meta.url), JSON.stringify(all, null, 1) + '\n');
console.log(`destinations.json: ${all.length}곳 (${files.join(', ')})`);
