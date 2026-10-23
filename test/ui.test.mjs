import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// ---- 최소 가짜 DOM ----
class Node_ {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = {}; this.listeners = {}; this.parent = null; this._text = ''; this.hidden = false; }
  get firstChild() { return this.children[0] ?? null; }
  appendChild(c) { if (c.parent) c.parent.removeChild(c); c.parent = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parent = null; return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(typeof c === 'string' ? new Text_(c) : c)); }
  replaceChildren(...cs) { this.children.forEach((c) => { c.parent = null; }); this.children = []; this.append(...cs); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
  fire(t, ev = {}) { (this.listeners[t] ?? []).forEach((f) => f({ preventDefault() {}, ...ev, target: ev.target ?? this })); }
  getBoundingClientRect() { return { width: 360 }; }
  set textContent(v) { this.children = []; this._text = String(v); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set className(v) { this.attrs.class = v; } get className() { return this.attrs.class ?? ''; }
  find(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach((c) => c.find?.(pred, out)); return out; }
}
class Text_ { constructor(t) { this.data = t; this.parent = null; } get textContent() { return this.data; } }
globalThis.document = {
  createElement: (t) => new Node_(t), createElementNS: (_, t) => new Node_(t), createTextNode: (t) => new Text_(t),
};
const cls = (n, c) => (n.attrs.class ?? '').split(/\s+/).includes(c);
const byClass = (root, c) => root.find((n) => cls(n, c));

const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}.json`, import.meta.url)));
const bal = rd('balance');
const data = { destinations: rd('destinations'), events: rd('events'), trends: rd('trends'), world: rd('world') };

const { createApp } = await import('../src/app.js');
const mm = await import('../src/util/mapmath.js');
const { budgetImpact } = await import('../src/ui/transport.js');
const { newState } = await import('../src/state.js');

test('투영: 서울/로스앤젤레스', () => {
  const s = mm.project({ lat: 37.5665, lon: 126.978 });
  assert.ok(Math.abs(s.x - 306.978) < 1e-9 && Math.abs(s.y - 52.4335) < 1e-9);
  const la = mm.project({ lat: 34.0522, lon: -118.2437 });
  assert.ok(la.x > 61 && la.x < 62 && la.y > 55 && la.y < 56);
});

test('필터: 탭/검색/태그/제철', () => {
  const dom = mm.filterDests(data.destinations, { tab: 'domestic' }, 4);
  assert.equal(dom.length, 10);
  assert.equal(mm.filterDests(data.destinations, { tab: 'overseas' }, 4).length, 90);
  assert.ok(mm.filterDests(data.destinations, { q: '제주' }, 1).some((d) => d.id === 'jeju'));
  assert.ok(mm.filterDests(data.destinations, { tab: 'domestic', season: true }, 4).every((d) => d.bestSeason.includes(4)));
  assert.ok(mm.filterDests(data.destinations, { tag: '오로라' }, 1).every((d) => d.tags.includes('오로라')));
});

test('뷰 클램프/줌', () => {
  const v = mm.zoomView(mm.WORLD_VIEW, 0.5, 180, 90);
  assert.equal(v.w, 180);
  const c = mm.clampView({ x: -50, y: 500, w: 100, h: 50 });
  assert.ok(c.x >= 0 && c.y + c.h <= 180);
});

test('이동수단 예산 영향', () => {
  const s = newState(bal, 1);
  const cheap = budgetImpact(s, { costRoundTrip: 100000 }, bal);
  assert.ok(cheap.affordable && cheap.ratio < 0.1);
  assert.equal(budgetImpact(s, { costRoundTrip: 1e9 }, bal).affordable, false);
});

test('흐름: 스튜디오 → 지도 → 이동수단 → 스텁 도달, 상태 불변', () => {
  const root = new Node_('div');
  const app = createApp(root, data, bal, { persist: false, seed: 7 });
  assert.equal(app.route.name, 'studio');
  assert.ok(root.textContent.includes('1,000'), '구독자 표시');
  const before = JSON.stringify(app.state);

  byClass(root, 'go')[0].fire('click');
  assert.equal(app.route.name, 'map');
  assert.equal(byClass(root, 'pin').length, 10, '국내 핀 10');
  byClass(root, 'tab').find((t) => t.attrs['data-tab'] === 'overseas').fire('click');
  assert.equal(byClass(root, 'pin').length, 90, '해외 핀 90');
  byClass(root, 'tab').find((t) => t.attrs['data-tab'] === 'domestic').fire('click');

  const jeju = byClass(root, 'pin').find((p) => p.attrs['data-id'] === 'jeju');
  jeju.fire('click');
  byClass(root, 'select')[0].fire('click');
  assert.equal(app.route.name, 'transport');
  assert.ok(byClass(root, 'tcard').length >= 1);

  byClass(root, 'pick')[0].fire('click');
  assert.equal(app.route.name, 'stub');
  assert.ok(root.textContent.includes('제주'));
  assert.equal(JSON.stringify(app.state), before, '스텁은 상태를 바꾸지 않음');
});

test('울릉도 선박 카드 강조', () => {
  const root = new Node_('div');
  const app = createApp(root, data, bal, { persist: false, seed: 1 });
  app.nav('transport', { dest: data.destinations.find((d) => d.id === 'ulleungdo') });
  assert.equal(byClass(root, 'hl').length, 1);
});

test('휴식/훈련 액션이 지표 갱신', () => {
  const root = new Node_('div');
  const app = createApp(root, data, bal, { persist: false, seed: 1 });
  byClass(root, 'train-shoot')[0].fire('click');
  assert.equal(app.state.shootLv, 2);
  byClass(root, 'rest')[0].fire('click');
  assert.equal(app.state.day, 2);
});

test('전 여행지 이동수단 화면/스텁 렌더 가능', () => {
  for (const d of data.destinations) {
    const root = new Node_('div');
    const app = createApp(root, data, bal, { persist: false, seed: 1 });
    app.nav('transport', { dest: d });
    app.nav('stub', { dest: d, transport: d.transports[0] });
    assert.ok(root.textContent.length > 0, d.id);
  }
});
