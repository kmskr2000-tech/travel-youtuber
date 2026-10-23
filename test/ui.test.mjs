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

test('흐름: 스튜디오 → 지도 → 이동수단 → 플래너 도달, 상태 불변', () => {
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
  assert.equal(app.route.name, 'planner');
  assert.ok(root.textContent.includes('제주'));
  assert.equal(JSON.stringify(app.state), before, '플래너는 확정 전 상태를 바꾸지 않음');
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

test('전 여행지 이동수단/플래너 화면 렌더 가능', () => {
  for (const d of data.destinations) {
    const root = new Node_('div');
    const app = createApp(root, data, bal, { persist: false, seed: 1 });
    app.nav('transport', { dest: d });
    app.nav('planner', { dest: d, transport: d.transports[0] });
    assert.ok(root.textContent.length > 0, d.id);
  }
});

const pl = await import('../src/util/planner.js');
const jeju = data.destinations.find((d) => d.id === 'jeju');

test('플래너 로직: 배치/충돌/이동/삭제/체류일', () => {
  const tr = jeju.transports[0];
  let plan = pl.emptyPlan(jeju, tr);
  const one = jeju.sights.find((c) => c.slots === 1), two = jeju.activities.find((c) => c.slots === 2);
  let r = pl.placeCard(plan, jeju, one.id, 1, 0); assert.ok(r.plan); plan = r.plan;
  assert.ok(pl.placeCard(plan, jeju, two.id, 1, 0).error, '충돌');
  assert.ok(pl.placeCard(plan, jeju, two.id, 1, 2).error, '하루 경계');
  plan = pl.placeCard(plan, jeju, two.id, 1, 1).plan;
  assert.equal(pl.gridOf(plan, jeju)[0][2].head, false, '2칸 카드 둘째 칸');
  plan = pl.placeCard(plan, jeju, one.id, 2, 0).plan; // 이동
  assert.equal(plan.placements.filter((p) => p.cardId === one.id).length, 1);
  assert.equal(plan.placements.find((p) => p.cardId === one.id).day, 2);
  plan = pl.setDays(plan, 1);
  assert.ok(plan.placements.every((p) => p.day === 1));
  assert.equal(pl.removeCard(plan, two.id).placements.length, 0);
  assert.deepEqual(pl.diversityInfo(['sight']).missing, ['액티비티', '먹거리']);
});

test('확정 상태: 빈 일정/대출/정상', () => {
  const s = newState(bal, 1);
  const tr = jeju.transports[0];
  const plan = pl.emptyPlan(jeju, tr);
  const { previewTrip } = awaitedGame;
  assert.equal(pl.confirmState(s, previewTrip(s, jeju, plan, bal)).enabled, false);
  const c = jeju.sights[0];
  const p2 = pl.placeCard(plan, jeju, c.id, 1, 0).plan;
  assert.equal(pl.confirmState(s, previewTrip(s, jeju, p2, bal)).enabled, true);
  const poor = { ...s, cash: 100000 };
  const cs = pl.confirmState(poor, previewTrip(poor, jeju, p2, bal));
  assert.ok(cs.enabled && cs.loan > 0 && cs.label.includes('대출'));
});
const awaitedGame = await import('../src/engine/game.js');

test('풀 플레이 한 판: 플래너 → 촬영(이벤트 선택) → 편집 → 결과 → 스튜디오', () => {
  const root = new Node_('div');
  const app = createApp(root, data, bal, { persist: false, seed: 3 });
  const tr = jeju.transports[0];
  app.nav('planner', { dest: jeju, transport: tr });
  const pool = byClass(root, 'pcard');
  for (const [i, c] of [jeju.sights[0], jeju.foods[0]].entries()) {
    byClass(root, 'pcard').find((p) => p.attrs['data-id'] === c.id).fire('click');
    byClass(root, 'slot').filter((s) => cls(s, 'empty'))[0].fire('click');
  }
  assert.equal(byClass(root, 'filled').length, 2);
  const cash0 = app.state.cash;
  byClass(root, 'confirm')[0].fire('click');
  assert.equal(app.route.name, 'shoot');
  assert.equal(app.state.cash, cash0, '촬영 시작 전 비용 미지불');
  byClass(root, 'start')[0].fire('click');
  let guard = 0;
  while (byClass(root, 'choice').length && guard++ < 50) byClass(root, 'choice')[0].fire('click');
  assert.ok(byClass(root, 'upload').length === 1, '편집 단계 도달');
  byClass(root, 'editdays')[0].fire('input', { target: { value: '2' } });
  assert.ok(root.textContent.includes('예상 품질'));
  byClass(root, 'upload')[0].fire('click');
  assert.equal(app.route.name, 'result');
  assert.equal(app.state.videos.length, 1);
  assert.ok(app.state.cash !== cash0 || app.state.loan > 0);
  assert.ok(byClass(root, 'ytitle').length === 1 || byClass(root, 'home').length === 1);
  byClass(root, 'home')[0].fire('click');
  assert.equal(app.route.name, 'studio');
});

test('재생 해석: 선택 수집 후 최종 결과가 시뮬과 동일', () => {
  const s = newState(bal, 11);
  const plan = pl.placeCard(pl.emptyPlan(jeju, jeju.transports[0]), jeju, jeju.sights[0].id, 1, 0).plan;
  const choices = [];
  let r;
  for (let i = 0; i < 30; i++) { r = pl.resolveWithChoices(s, jeju, plan, { editDays: 1, style: 'info' }, data, bal, choices); if (!r.pending) break; choices.push(0); }
  assert.ok(r.state && r.report);
  const direct = awaitedGame.resolveTrip(s, jeju, plan, { editDays: 1, style: 'info' }, data, bal);
  assert.equal(r.report.views, direct.report.views);
  assert.equal(r.state.cash, direct.state.cash);
});

test('전 여행지 플래너 렌더 + 자동 일정 확정 가능', () => {
  for (const d of data.destinations) {
    const s = newState(bal, 1);
    const tr = d.transports[0];
    const p = pl.placeCard(pl.emptyPlan(d, tr), d, d.sights[0].id, 1, 0).plan;
    const pv = awaitedGame.previewTrip(s, d, p, bal);
    assert.ok(pv.errors.every((e) => !e.includes('카드 없음')), d.id);
  }
});
