// 엔진 보강 단위/속성 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { makeRng } from '../src/engine/rng.js';
import { eligible, pickEvent, sumEffects } from '../src/engine/events.js';
import { staminaCap, soloMult } from '../src/engine/burnout.js';
import { evaluatePlan, findCard, legCost } from '../src/engine/trip.js';
import { resolveTrip, previewTrip, rest } from '../src/engine/game.js';
import { borrow, repay, pay, monthOf, availableCredit } from '../src/engine/economy.js';
import { newState, save, load, clearSave, SAVE_KEY } from '../src/state.js';
import { won, num, compact, views, signed, dateLabel } from '../src/util/format.js';
import { emptyPlan, placeCard } from '../src/util/planner.js';

const rd = (p) => JSON.parse(readFileSync(new URL(`../data/${p}.json`, import.meta.url)));
const bal = rd('balance'), dests = rd('destinations'), events = rd('events'), trends = rd('trends');
const data = { events, trends };

test('데이터 검증 스크립트 통과 (exit 0)', () => {
  const r = spawnSync(process.execPath, ['tools/validate-data.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('rng: int/pick 범위, 상태 복원 재현', () => {
  const r = makeRng(42);
  for (let i = 0; i < 500; i++) { const v = r.int(3, 7); assert.ok(v >= 3 && v <= 7); assert.ok(['a', 'b'].includes(r.pick(['a', 'b']))); }
  const a = makeRng(7); a.next(); a.next();
  const b = makeRng(a.state);
  assert.equal(a.next(), b.next());
});

test('이벤트 조건: 월·평판·체력·구독자·모드', () => {
  const base = { trigger: 'slot', conditions: {}, choices: [] };
  assert.ok(eligible(base, { trigger: 'slot' }));
  assert.ok(!eligible(base, { trigger: 'upload' }));
  assert.ok(!eligible({ ...base, conditions: { months: [7] } }, { trigger: 'slot', month: 1 }));
  assert.ok(eligible({ ...base, conditions: { months: [7] } }, { trigger: 'slot', month: 7 }));
  assert.ok(!eligible({ ...base, conditions: { minSubs: 1000 } }, { trigger: 'slot', subs: 10 }));
  assert.ok(!eligible({ ...base, conditions: { maxStamina: 30 } }, { trigger: 'slot', stamina: 90 }));
  assert.ok(!eligible({ ...base, conditions: { modes: ['lcc'] } }, { trigger: 'slot', mode: 'ktx' }));
  assert.ok(!eligible({ ...base, conditions: { minDurationMin: 600 } }, { trigger: 'slot', durationMin: 100 }));
});

test('이벤트 선택: 후보 없음 null, 여행지 가중 boost, 효과 기본값', () => {
  assert.equal(pickEvent([], { trigger: 'slot' }, makeRng(1)), null);
  const evs = [{ id: 'a', trigger: 'slot', weight: 1, conditions: {} }, { id: 'b', trigger: 'slot', weight: 1, conditions: {} }];
  let b = 0;
  for (let i = 1; i <= 400; i++) if (pickEvent(evs, { trigger: 'slot', dest: { events: ['b'] } }, makeRng(i)).id === 'b') b++;
  assert.ok(b > 220 && b < 300, `b 비중 ${b}/400 (기대 ≈ 2/3)`);
  assert.deepEqual(sumEffects(), { stamina: 0, cost: 0, W: 0, rep: 0, days: 0, subsPct: 0, lostSlot: 0 });
});

test('체력 상한·단독 운영 배율은 구독자에 단조', () => {
  let prev = Infinity, prevSolo = 0;
  for (const subs of [0, 1e4, 1e5, 5e5, 1e6]) {
    const cap = staminaCap(subs, bal), solo = soloMult(subs, bal);
    assert.ok(cap <= prev && cap > 0 && cap <= bal.stamina.max); prev = cap;
    assert.ok(solo >= prevSolo && solo >= 1); prevSolo = solo;
  }
});

test('이동 시간 경계: 정확히 360/720분', () => {
  assert.deepEqual(legCost(360, bal), { days: 0, slots: 1 });
  assert.equal(legCost(361, bal).days, bal.travel.midDays);
  assert.equal(legCost(720, bal).days, bal.travel.midDays);
  assert.equal(legCost(721, bal).days, bal.travel.longDays);
});

test('포맷 유틸', () => {
  assert.equal(won(1234567), '1,234,567원'); assert.equal(num(1234.6), '1,235');
  assert.equal(compact(25000000), '2500만'); assert.equal(compact(150000000), '1.5억'); assert.equal(compact(9999), '9,999');
  assert.equal(views(1500), '1.5K'); assert.equal(views(2500000), '2.5M'); assert.equal(views(12), '12');
  assert.equal(signed(5), '+5'); assert.equal(signed(-5), '−5'); assert.equal(signed(0), '±0');
  assert.match(dateLabel(1, monthOf), /Day 1 · 2027년 \d+월/);
});

test('저장: 스키마 불일치/깨진 JSON → null, clearSave', () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  assert.equal(load(st), null);
  mem.set(SAVE_KEY, '{oops'); assert.equal(load(st), null);
  mem.set(SAVE_KEY, JSON.stringify({ schemaVersion: 999 })); assert.equal(load(st), null);
  const s = newState(bal, 3); assert.ok(save(s, st)); assert.deepEqual(load(st), s);
  assert.ok(clearSave(st)); assert.equal(load(st), null);
});

test('불변성: 모든 엔진 함수는 입력 state를 바꾸지 않는다', () => {
  const s = newState(bal, 9), snap = JSON.stringify(s);
  const d = dests.find((x) => x.id === 'jeju');
  const plan = placeCard(emptyPlan(d, d.transports[0]), d, d.sights[0].id, 1, 0).plan;
  resolveTrip(s, d, plan, { editDays: 1 }, data, bal); rest(s, 1, bal); borrow(s, 100000, bal); pay(s, 5e6, bal); repay({ ...s, loan: 5 }, 5);
  assert.equal(JSON.stringify(s), snap);
});

test('속성: 전 여행지·무작위 일정은 NaN 없이 정산되고 불변식 유지', () => {
  const rng = makeRng(2026);
  let ok = 0;
  for (let i = 0; i < 300; i++) {
    const d = rng.pick(dests), tr = rng.pick(d.transports);
    let plan = { ...emptyPlan(d, tr), days: rng.int(1, 7), lodging: rng.pick(['guesthouse', 'business', 'hotel']) };
    const all = [...d.sights, ...d.activities, ...d.foods];
    for (let k = 0; k < 8; k++) { const c = rng.pick(all); const r = placeCard(plan, d, c.id, rng.int(1, plan.days), rng.int(0, 2)); if (r.plan) plan = r.plan; }
    const ev = evaluatePlan(d, plan, bal);
    assert.equal(ev.cost.total, ev.cost.transport + ev.cost.lodging + ev.cost.food + ev.cost.cards + ev.cost.rental, d.id);
    if (!ev.ok) continue;
    const s0 = { ...newState(bal, i + 1), cash: 5e8 };
    const { state, report } = resolveTrip(s0, d, plan, { editDays: rng.int(0, 3), style: rng.pick(['info', 'emotion', 'bait']) }, data, bal);
    for (const v of [state.cash, state.subs, state.stamina, state.reputation, state.loan, state.day]) assert.ok(Number.isFinite(v), `${d.id} state NaN`);
    assert.ok(state.subs >= 0 && state.stamina >= 0 && state.loan >= 0 && state.day > s0.day);
    assert.ok(state.reputation >= 0 && state.reputation <= 100);
    if (!report.burnout) { assert.ok(report.Q >= bal.quality.min - 1e-9 && report.Q <= bal.quality.max + 1e-9); assert.ok(report.views >= 0 && Number.isFinite(report.views)); ok++; }
  }
  assert.ok(ok > 100, `정상 정산 ${ok}건`);
});

test('대출: 한도 끝까지 빌려도 파산 아님, 1원 초과는 거부', () => {
  const s = newState(bal, 1);
  const credit = availableCredit(s, bal);
  const b = borrow(s, credit, bal);
  assert.ok(!b.over); assert.equal(b.loan, credit); assert.equal(availableCredit(b, bal), 0);
  assert.throws(() => borrow(b, 1, bal), /한도/);
});
