import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../src/engine/rng.js';
import { reachRate, quality, computeViews, computeSubGain, adRevenue, sponsorAmount, sponsorChance, trendMult, editScore, contentScore } from '../src/engine/views.js';
import { evaluatePlan, legCost } from '../src/engine/trip.js';
import { pay, loanLimit, advanceDays, repay } from '../src/engine/economy.js';
import { resolveTrip, rest, trainSkill, previewTrip } from '../src/engine/game.js';
import { newState, save, load } from '../src/state.js';
import { FIXTURES } from '../tools/fixtures.mjs';

const bal = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url)));
const events = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url)));
const data = { events, trends: [] };
const dest = FIXTURES.find((d) => d.id === 'dom-ktx');
const basePlan = { days: 2, transport: 'ktx', rental: false, lodging: 'business',
  placements: [{ cardId: 'dom-ktx-s3', day: 1, slot: 1 }, { cardId: 'dom-ktx-f3', day: 1, slot: 2 }, { cardId: 'dom-ktx-a2', day: 2, slot: 0 }] };

test('rng: 같은 시드 → 같은 수열', () => {
  const a = makeRng(7), b = makeRng(7);
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next());
});

test('도달률 0.10~0.30', () => {
  assert.equal(reachRate(0, bal), 0.10);
  assert.ok(Math.abs(reachRate(100, bal) - 0.30) < 1e-9);
  assert.ok(Math.abs(reachRate(50, bal) - 0.20) < 1e-9);
});

test('조회수 공식: (구독자×r + 1500Q) × Q × P × T × X', () => {
  const v = computeViews({ subs: 1000, rep: 50, Q: 1, P: 1, T: 1, viral: false }, bal);
  assert.equal(v, 1700); // (200 + 1500) × 1
  const vv = computeViews({ subs: 1000, rep: 50, Q: 1, P: 1, T: 1, viral: true }, bal);
  assert.equal(vv, 17000);
  const q2 = computeViews({ subs: 1000, rep: 50, Q: 2, P: 1, T: 1, viral: false }, bal);
  assert.equal(q2, Math.round((200 + 3000) * 2));
});

test('품질계수 범위 0.5~2.0', () => {
  assert.equal(quality({ C: 0, shootLv: 1, E: 0, W: 0 }, bal), 0.5);
  assert.ok(Math.abs(quality({ C: 1, shootLv: 10, E: 1, W: 1 }, bal) - 2.0) < 1e-9);
});

test('광고 수익 CPM 2,000원/1000뷰', () => assert.equal(adRevenue(50000, bal), 100000));

test('협찬: 1만 미만 확률 0, 금액 범위 50~500만', () => {
  assert.equal(sponsorChance(9999, 100, bal), 0);
  assert.ok(sponsorChance(10000, 100, bal) > 0);
  assert.equal(sponsorAmount(10000, bal), 500000);
  assert.ok(sponsorAmount(10 ** 8, bal) <= 5000000);
});

test('트렌드 0.8~1.5 클램프', () => {
  const tr = [{ tag: 'a', months: [1], multiplier: 3 }];
  assert.equal(trendMult({ tags: ['a'], month: 1, bestSeason: [] }, tr, bal), 1.5);
  assert.equal(trendMult({ tags: [], month: 1, bestSeason: [5] }, [], bal), 0.85);
});

test('이동 일수 규칙: 6h/12h 경계', () => {
  assert.deepEqual(legCost(360, bal), { days: 0, slots: 1 });
  assert.deepEqual(legCost(361, bal), { days: 1, slots: 0 });
  assert.deepEqual(legCost(720, bal), { days: 1, slots: 0 });
  assert.deepEqual(legCost(721, bal), { days: 2, slots: 0 });
});

test('일정 평가: 비용·체력·검증', () => {
  const ev = evaluatePlan(dest, basePlan, bal);
  assert.ok(ev.ok, ev.errors.join());
  assert.equal(ev.cost.transport, 80000);
  assert.equal(ev.cost.lodging, 70000); // 1박 × 70000 × 물가 1.0
  assert.equal(ev.cost.food, 60000);
  assert.equal(ev.staminaDelta, ev.recover - ev.fatigue);
  const bad = evaluatePlan(dest, { ...basePlan, placements: [...basePlan.placements, { cardId: 'dom-ktx-s3', day: 2, slot: 2 }] }, bal);
  assert.equal(bad.ok, false);
  const conflict = evaluatePlan(dest, { ...basePlan, placements: [{ cardId: 'dom-ktx-a1', day: 1, slot: 1 }, { cardId: 'dom-ktx-s1', day: 1, slot: 2 }] }, bal);
  assert.equal(conflict.ok, false);
});

test('대출: 한도 3,000,000 + 구독자×100, 초과 시 파산', () => {
  const s = newState(bal, 1);
  assert.equal(loanLimit(s, bal), 3100000);
  const a = pay(s, 5000000, bal);
  assert.equal(a.cash, 0); assert.equal(a.loan, 2000000); assert.equal(a.over, null);
  const b = pay(s, 7000000, bal);
  assert.equal(b.over.type, 'bankrupt');
});

test('이자: 30일 경계 월 2%, 공백 감소', () => {
  let s = { ...newState(bal, 1), loan: 1000000, day: 29 };
  s = advanceDays(s, 1, bal);
  assert.equal(s.loan, 1020000);
  const i = { ...newState(bal, 1), day: 1, lastUploadDay: 1 };
  const j = advanceDays(i, 38, bal); // 39일차: 공백 38 → 30 초과 후 7일째 아님(idle=38, 38-30=8)
  const k = advanceDays(i, 37, bal); // idle=37 → 7 → 1% 감소
  assert.equal(k.subs, 990);
  assert.ok(j.subs <= 990);
});

test('여행 처리: 결정적(같은 시드 = 같은 결과), 상태 불변', () => {
  const s0 = newState(bal, 42);
  const snap = JSON.stringify(s0);
  const r1 = resolveTrip(s0, dest, basePlan, { editDays: 1, style: 'info' }, data, bal);
  const r2 = resolveTrip(s0, dest, basePlan, { editDays: 1, style: 'info' }, data, bal);
  assert.deepEqual(r1.state, r2.state);
  assert.equal(JSON.stringify(s0), snap);
  assert.ok(r1.state.subs > s0.subs);
  assert.ok(r1.state.cash < s0.cash);
  assert.equal(r1.state.videos.length, 1);
  assert.ok(r1.state.visited.includes('dom-ktx'));
  assert.ok(r1.state.day > s0.day);
});

test('예산 부족/일정 오류는 예외', () => {
  const poor = { ...newState(bal, 1), cash: 0, loan: loanLimit(newState(bal, 1), bal) };
  assert.throws(() => resolveTrip(poor, dest, basePlan, {}, data, bal), /예산/);
  assert.throws(() => resolveTrip(newState(bal, 1), dest, { ...basePlan, transport: 'cruise' }, {}, data, bal), /일정 오류/);
});

test('번아웃: 체력 0 이하 → 게임오버 아님, 휴식 후 복귀', () => {
  const eu = FIXTURES.find((d) => d.id === 'eu-long');
  const plan = { days: 5, transport: 'fsc', rental: false, lodging: 'guesthouse', placements: [] };
  const s0 = { ...newState(bal, 3), cash: 1e8, stamina: 10 };
  const { state } = resolveTrip(s0, eu, plan, { editDays: 0, choose: (e) => e.choices.length - 1 }, { events: events.slice(0, 6), trends: [] }, bal);
  assert.equal(state.over, null);
  assert.equal(state.burnouts, 1);
  assert.equal(state.stamina, bal.burnout.recoverTo);
  assert.ok(state.day - s0.day >= bal.burnout.restDays);
  assert.equal(state.videos.length, 0);
});

test('엔딩: 구독자 100만 도달', () => {
  const s0 = { ...newState(bal, 5), subs: 999000 };
  let s = s0; let n = 0;
  while (!s.ended && !s.over && n++ < 50) { s = rest(s, 5, bal); s = resolveTrip(s, dest, basePlan, { editDays: 1, style: 'bait' }, data, { ...bal, conversion: 5 }).state; }
  assert.equal(s.ended?.type, 'win');
});

test('휴식·훈련', () => {
  const s = { ...newState(bal, 1), stamina: 40 };
  assert.equal(rest(s, 2, bal).stamina, 90);
  assert.equal(trainSkill(s, 'shoot', bal).shootLv, 2);
  assert.equal(trainSkill(s, 'shoot', bal).cash, s.cash - 50000);
});

test('저장/로드 (localStorage 스텁, 실패해도 예외 없음)', () => {
  const mem = new Map();
  const st = { setItem: (k, v) => mem.set(k, v), getItem: (k) => mem.get(k) ?? null };
  const s = newState(bal, 9);
  assert.equal(save(s, st), true);
  assert.deepEqual(load(st), s);
  assert.equal(save(s, null), false);
  assert.equal(load(null), null);
});

test('미리보기는 상태를 바꾸지 않는다', () => {
  const s = newState(bal, 1); const snap = JSON.stringify(s);
  const pv = previewTrip(s, dest, basePlan, bal);
  assert.ok(pv.affordable);
  assert.equal(JSON.stringify(s), snap);
});

import { noveltyMult } from '../src/engine/views.js';
test('첫 방문 신선도 보너스: 재방문 x1, 첫 방문 1.3~2.0', async () => {
  const bal = JSON.parse((await import('node:fs')).readFileSync(new URL('../data/balance.json', import.meta.url), 'utf8'));
  assert.equal(noveltyMult(600, false, bal), 1);
  assert.equal(noveltyMult(0, true, bal), 1.3);
  assert.equal(noveltyMult(5000, true, bal), 2.0);
  const mid = noveltyMult(500, true, bal);
  assert.ok(mid > 1.3 && mid < 2.0);
});

test('번아웃/고구독자: 체력 상한·단독 운영 배율은 10만~100만 구간 선형', async () => {
  const { staminaCap, soloMult } = await import('../src/engine/burnout.js');
  assert.equal(staminaCap(99999, bal), 100);
  assert.equal(staminaCap(1000000, bal), bal.burnout.staminaFloor);
  assert.equal(soloMult(100000, bal), 1);
  assert.equal(soloMult(1000000, bal), bal.burnout.soloMax);
  assert.ok(staminaCap(550000, bal) < 100 && staminaCap(550000, bal) > bal.burnout.staminaFloor);
});

test('하락형 정체: 연속 N편 비율 미달 → reachMult 감소, 회복 시 복구, 1만 미만은 제외', async () => {
  const { stagnationUpdate } = await import('../src/engine/burnout.js');
  const g = bal.stagnation;
  let s = { subs: 50000, lowStreak: 0, reachMult: 1 };
  for (let i = 0; i < g.streakN - 1; i++) s = { ...s, ...stagnationUpdate(s, 1000, bal) };
  assert.equal(s.reachMult, 1);
  s = { ...s, ...stagnationUpdate(s, 1000, bal) };
  assert.ok(s.reachMult < 1);
  const low = s.reachMult;
  s = { ...s, ...stagnationUpdate(s, 50000, bal) };
  assert.equal(s.lowStreak, 0);
  assert.ok(s.reachMult > low);
  const small = stagnationUpdate({ subs: 5000, lowStreak: 9, reachMult: 1 }, 10, bal);
  assert.equal(small.lowStreak, 0);
});

test('번아웃 복귀 후에도 계속 플레이 가능(over 없음)', () => {
  const eu = FIXTURES.find((d) => d.id === 'eu-long');
  const plan = { days: 5, transport: 'fsc', rental: false, lodging: 'guesthouse', placements: [] };
  const { state } = resolveTrip({ ...newState(bal, 3), cash: 1e8, stamina: 10 }, eu, plan, { choose: (e) => e.choices.length - 1 }, data, bal);
  const r = resolveTrip(state, dest, basePlan, { editDays: 1 }, data, bal);
  assert.equal(r.state.videos.length, 1);
});

test('이벤트 조건: 대륙·태그·교통시간', async () => {
  const { eligible } = await import('../src/engine/events.js');
  const dest = { region: 'overseas', continent: 'asia', subregion: 'southeast-asia', country: 'TH', tags: ['도시', '먹방'] };
  const base = { trigger: 'slot', month: 7, dest, subs: 0, stamina: 100 };
  assert.ok(eligible({ trigger: 'slot', conditions: { continents: ['asia'], tags: ['먹방'] } }, base));
  assert.ok(!eligible({ trigger: 'slot', conditions: { continents: ['europe'] } }, base));
  assert.ok(!eligible({ trigger: 'slot', conditions: { tags: ['사막'] } }, base));
  assert.ok(!eligible({ trigger: 'slot', conditions: { subregions: ['south-asia'] } }, base));
  assert.ok(!eligible({ trigger: 'transport', conditions: { minDurationMin: 600 } }, { ...base, trigger: 'transport', durationMin: 300 }));
  assert.ok(eligible({ trigger: 'transport', conditions: { minDurationMin: 600 } }, { ...base, trigger: 'transport', durationMin: 840 }));
});

test('이벤트·트렌드 데이터 스키마', () => {
  const tr = JSON.parse(readFileSync(new URL('../data/trends.json', import.meta.url)));
  assert.ok(events.length >= 40 && tr.length >= 15);
  for (const t of tr) assert.ok(t.multiplier > 1 && t.multiplier <= 1.3 && t.months.length);
  for (const e of events) assert.ok(e.choices.length >= 1 && ['slot', 'transport', 'upload'].includes(e.trigger));
});
