import { createApp } from './app.js';

// 배포 캐시 대책: window.__V(배포 시 주입)와 version.json(no-store)을 비교, 다르면 새 버전으로 교체
const V = globalThis.__V;
if (V) {
  try {
    const { v } = await fetch('version.json', { cache: 'no-store' }).then((r) => r.json());
    if (String(v) !== String(V) && !location.search.includes(`v=${v}`)) {
      location.replace(`${location.pathname}?v=${v}`);
      await new Promise(() => {});
    }
  } catch { /* 오프라인 등: 현재 버전으로 진행 */ }
}
const q = V ? `?v=${V}` : '';
const j = (p) => fetch(p + q).then((r) => r.json());
const [bal, destinations, events, trends, world] = await Promise.all(
  ['data/balance.json', 'data/destinations.json', 'data/events.json', 'data/trends.json', 'data/world.json'].map(j));
createApp(document.getElementById('app'), { destinations, events, trends, world }, bal);
