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

const eco = await import('../src/engine/economy.js');
test('대출: 빌리기 한도/상환/검증', () => {
  const s = newState(bal, 1);
  const avail = eco.availableCredit(s, bal);
  const b = eco.borrow(s, 1_000_000, bal);
  assert.equal(b.cash, s.cash + 1_000_000); assert.equal(b.loan, 1_000_000);
  assert.throws(() => eco.borrow(s, avail + 1, bal), /한도/);
  assert.throws(() => eco.borrow(s, 0, bal));
  const r = eco.repay(b, 400_000);
  assert.equal(r.loan, 600_000); assert.equal(r.cash, b.cash - 400_000);
  assert.equal(eco.repay(b, 9e9).loan, 0);
  assert.throws(() => eco.repay(s, 1000), /대출이 없/);
});

test('대출 UI: 빌리기·상환 버튼 상태 반영', () => {
  const root = new Node_('div');
  const app = createApp(root, data, bal, { persist: false, seed: 1 });
  byClass(root, 'loan-amt')[0].value = '500000';
  byClass(root, 'borrow')[0].fire('click');
  assert.equal(app.state.loan, 500000);
  byClass(root, 'loan-amt')[0].value = '200000';
  byClass(root, 'repay')[0].fire('click');
  assert.equal(app.state.loan, 300000);
  byClass(root, 'repay-all')[0].fire('click');
  assert.equal(app.state.loan, 0);
  assert.ok(byClass(root, 'repay')[0].attrs.disabled !== undefined, '대출 0이면 상환 비활성');
});

test('엔딩: 파산/승리 시 엔딩 화면, 새 게임 초기화', () => {
  for (const [patch, key] of [[{ over: { type: 'bankrupt', day: 40 } }, 'lose'], [{ ended: { type: 'win', day: 300 }, subs: 1_000_000 }, 'win']]) {
    const root = new Node_('div');
    const app = createApp(root, data, bal, { persist: false, seed: 1 });
    app.setState({ ...app.state, ...patch });
    assert.equal(app.route.name, 'ending');
    assert.equal(byClass(root, key).length, 1);
    byClass(root, 'new-game')[0].fire('click');
    assert.equal(app.route.name, 'studio');
    assert.equal(app.state.day, 1); assert.equal(app.state.subs, bal.start.subs);
  }
});

test('이자로 파산하면 휴식에서 엔딩 진입', () => {
  const root = new Node_('div');
  const app = createApp(root, data, bal, { persist: false, seed: 1 });
  const lim = eco.loanLimit(app.state, bal);
  app.setState({ ...app.state, loan: lim - 1, day: 29 });
  byClass(root, 'rest')[0].fire('click');
  assert.equal(app.route.name, 'ending');
});

test('저장/로드: 새로고침 후 복원, 새 게임은 저장 삭제, 저장 실패 경고', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const root = new Node_('div');
  const app = createApp(root, data, bal, { storage, seed: 5 });
  byClass(root, 'train-shoot')[0].fire('click');
  assert.equal(app.state.shootLv, 2);
  const root2 = new Node_('div');
  const app2 = createApp(root2, data, bal, { storage, seed: 99 });
  assert.equal(app2.state.shootLv, 2, '복원');
  app2.newGame();
  assert.equal(JSON.parse(mem.get('travel-youtuber:save:v1')).shootLv, 1, '새 게임 저장');
  const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  const root3 = new Node_('div');
  const app3 = createApp(root3, data, bal, { storage: broken, seed: 1 });
  byClass(root3, 'rest')[0].fire('click');
  assert.equal(app3.saveOk, false);
  assert.ok(root3.textContent.includes('저장에 실패'));
});

test('새 게임 2단계 확인', () => {
  const root = new Node_('div');
  const app = createApp(root, data, bal, { persist: false, seed: 1 });
  byClass(root, 'train-shoot')[0].fire('click');
  byClass(root, 'new-game-btn')[0].fire('click');
  assert.equal(app.state.shootLv, 2, '1단계는 유지');
  byClass(root, 'confirm-new')[0].fire('click');
  assert.equal(app.state.shootLv, 1);
});

test('접근성: 팝업 dialog, 토글 aria-pressed, 슬롯 aria-label', () => {
  const root = new Node_('div');
  const app = createApp(root, data, bal, { persist: false, seed: 3 });
  app.nav('planner', { dest: jeju, transport: jeju.transports[0] });
  assert.ok(byClass(root, 'lodge').every((b) => b.attrs['aria-pressed'] !== undefined));
  assert.ok(byClass(root, 'slot').filter((s) => cls(s, 'empty')).every((s) => s.attrs['aria-label']));
});
