// 밸런스 몬테카를로 시뮬레이터. 사용: node tools/sim.mjs [--n 200] [--bal data/balance.json] [--max 400]
import { readFileSync } from 'node:fs';
import { makeRng } from '../src/engine/rng.js';
import { newState } from '../src/state.js';
import { resolveTrip, previewTrip, rest, rollSponsor, acceptSponsor, trainSkill } from '../src/engine/game.js';
import { repay, availableCredit } from '../src/engine/economy.js';
import { staminaCap, soloMult } from '../src/engine/burnout.js';
import { FIXTURES as FX } from './fixtures.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('--n', 200), MAXV = +arg('--max', 400);
const bal = JSON.parse(readFileSync(arg('--bal', new URL('../data/balance.json', import.meta.url)), 'utf8'));
// --set a.b=val (반복 가능) 으로 balance 일부를 덮어써 스윕
process.argv.forEach((a, i) => { if (a === '--set') { const [k, v] = process.argv[i + 1].split('='); const ks = k.split('.'); let o = bal; ks.slice(0, -1).forEach((x) => (o = o[x])); o[ks.at(-1)] = JSON.parse(v); } });
// --data 이면 data/destinations.json 실데이터 사용. 가상 원형 id는 실데이터 목록으로 매핑
const USE_DATA = process.argv.includes('--data');
const REAL = USE_DATA ? JSON.parse(readFileSync(new URL('../data/destinations.json', import.meta.url), 'utf8')) : null;
const FIXTURES = USE_DATA ? REAL : FX;
const ALIAS = USE_DATA ? (() => {
  const dom = REAL.filter((d) => d.region === 'domestic').map((d) => d.id), ov = REAL.filter((d) => d.region === 'overseas');
  const near = ['tokyo', 'osaka', 'taipei', 'guam'], sea = ['bangkok', 'danang', 'bali', 'singapore'];
  const longs = ov.filter((d) => !near.includes(d.id) && !sea.includes(d.id));
  const by = (c) => longs.filter((d) => d.continent === c).map((d) => d.id);
  return { 'dom-ktx': dom.filter((x) => !['jeju', 'ulleungdo'].includes(x)), 'dom-jeju': ['jeju'], 'asia-near': near, 'asia-sea': sea,
    'oce-long': by('oceania'), 'eu-long': [...by('europe'), ...by('asia')], 'am-long': [...by('north_america'), ...by('south_america')], 'afr-long': by('africa') };
})() : null;
const expand = (ids) => (ALIAS ? ids.flatMap((i) => ALIAS[i] ?? [i]) : ids);
const events = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const data = { events, trends: [{ tag: '자연', months: [4, 5, 9, 10], multiplier: 1.15 }] };

/** 슬롯을 점수/비용 탐욕으로 채움 */
function autoPlan(dest, days, transport, lodging, budget, bal, maxFatigue = 999) {
  const plan = { days, transport, rental: false, lodging, placements: [] };
  const base = previewTrip({ cash: 1e12, loan: 0, subs: 0, stamina: 100 }, dest, plan, bal);
  let spend = base.cost.total, fat = base.fatigue;
  const cards = [...dest.sights.map((c) => ({ ...c, kind: 'sight' })), ...dest.activities.map((c) => ({ ...c, kind: 'activity' })),
    ...dest.foods.map((c) => ({ ...c, kind: 'food' }))].sort((a, b) => b.points / (b.slots) - a.points / (a.slots));
  const used = new Set();
  let avail = base.slotsAvail;
  const grid = Array.from({ length: days }, () => [0, 0, 0]);
  let travelSlots = 3 * days - avail;
  // 이동 슬롯은 마지막 날 뒤쪽/첫날 앞쪽을 소모한다고 가정 → 배치는 가능한 칸만 사용
  for (let k = 0; k < travelSlots; k++) { const d = k % 2 ? days - 1 : 0; const idx = k % 2 ? grid[d].lastIndexOf(0) : grid[d].indexOf(0); if (idx >= 0) grid[d][idx] = 1; }
  for (const c of cards) {
    if (spend + c.cost > budget || fat + c.fatigue > maxFatigue) continue;
    outer: for (let d = 0; d < days; d++) for (let s = 0; s + c.slots <= 3; s++) {
      if (grid[d].slice(s, s + c.slots).every((v) => v === 0)) {
        for (let k = 0; k < c.slots; k++) grid[d][s + k] = 1;
        plan.placements.push({ cardId: c.id, day: d + 1, slot: s });
        spend += c.cost; fat += c.fatigue; used.add(c.id); break outer;
      }
    }
  }
  return plan;
}

const POLICIES = {
  prudent(s) {
    const tier = s.subs < 10000 ? ['dom-ktx', 'dom-jeju'] : s.subs < 100000 ? ['dom-jeju', 'asia-near', 'asia-sea'] : ['asia-near', 'oce-long', 'eu-long', 'am-long'];
    return { dests: tier, days: s.subs < 10000 ? 2 : 3, lodging: 'business', edit: 2, style: 'info', restBelow: 55 };
  },
  reckless(s) {
    return { dests: ['eu-long', 'am-long', 'afr-long'], days: 5, lodging: 'hotel', edit: 0, style: 'bait', restBelow: 0 };
  },
  cheap(s) {
    return { dests: ['dom-ktx'], days: 2, lodging: 'guesthouse', edit: 3, style: 'info', restBelow: 50 };
  },
  scaler(s) { // 구독자 따라 단계적으로 해외 확장, 훈련 투자
    const tier = s.subs < 5000 ? ['dom-ktx'] : s.subs < 30000 ? ['dom-jeju', 'asia-near'] : ['asia-near', 'asia-sea', 'oce-long', 'eu-long'];
    return { dests: tier, days: s.subs < 30000 ? 3 : 4, lodging: s.subs < 30000 ? 'business' : 'hotel', edit: 3, style: 'info', restBelow: 60 };
  },
};

function run(policyName, seed) {
  const rng = makeRng(seed ^ 0x9e3779b9);
  let s = newState(bal, seed);
  let v = 0, stuck = 0; const ms = {};
  while (!s.over && !s.ended && v < MAXV) {
    const p = POLICIES[policyName](s);
    if (s.stamina < p.restBelow) { s = rest(s, Math.ceil((90 - s.stamina) / bal.stamina.restDay), bal); }
    const sp = rollSponsor(s, bal, rng);
    if (sp) s = acceptSponsor(s, sp, bal);
    if (s.loan > 0 && s.cash > s.loan * 2 + 500000) s = repay(s, s.loan);
    if (s.cash > 400000 * s.shootLv && s.shootLv < 6 && policyName === 'scaler') s = trainSkill(s, 'shoot', bal);
    const budget = s.cash + availableCredit(s, bal);
    // 후보 여행지를 섞어 실행 가능한 첫 일정을 채택 (불가능하면 다음 후보)
    const order = [...expand(p.dests)]; for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let plan = null, dest = null;
    for (const destId of order) {
      const dd = FIXTURES.find((f) => f.id === destId);
      const tr = dd.transports[0].mode;
      // 예산 내에서 일수·숙소를 낮춰가며 가능한 일정 탐색
      for (const d of [p.days, Math.max(1, p.days - 1), 1]) for (const lg of [p.lodging, 'guesthouse']) {
        const cand = autoPlan(dd, d, tr, lg, budget, bal, Math.max(10, (s.stamina - 6) / soloMult(s.subs, bal) + 30));
        const c = previewTrip(s, dd, cand, bal);
        if (c.ok && c.affordable && (c.staminaAfter > 5 || p.restBelow === 0)) { plan = cand; dest = dd; } // 기존 동작 유지: 마지막으로 가능한 일정이 덮어씀(=짧은 일정 우선). 기준선 비교용
      }
      if (plan) break;
    }
    if (!plan) { if (++stuck > 3) break; s = rest(s, Math.ceil((staminaCap(s.subs, bal) - s.stamina) / bal.stamina.restDay) + 1, bal); continue; }
    stuck = 0;
    ({ state: s } = resolveTrip(s, dest, plan, { editDays: p.edit, style: p.style, choose: () => 0 }, data, bal));
    v++;
    for (const m of [10000, 100000, 1000000]) if (!ms[m] && s.subs >= m) ms[m] = { v, day: s.day };
  }
  return { s, v, ms, outcome: s.ended ? 'win' : s.over ? s.over.type : stuck > 3 ? 'stuck' : 'timeout' };
}

const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : null; };
console.log(`시뮬레이션 N=${N}/정책, 최대 ${MAXV}편, balance=${arg('--bal', 'data/balance.json')}`);
for (const name of Object.keys(POLICIES)) {
  const res = Array.from({ length: N }, (_, i) => run(name, i + 1));
  const cnt = {}; res.forEach((r) => (cnt[r.outcome] = (cnt[r.outcome] ?? 0) + 1));
  const wins = res.filter((r) => r.outcome === 'win');
  const subs = res.map((r) => r.s.subs), vids = res.map((r) => r.v);
  console.log(`\n[${name}] 결과: ${JSON.stringify(cnt)}`);
  console.log(`  편수 p50=${pct(vids, .5)} p90=${pct(vids, .9)} | 최종구독자 p10=${pct(subs, .1)} p50=${pct(subs, .5)} p90=${pct(subs, .9)}`);
  if (wins.length) console.log(`  달성 편수 p50=${pct(wins.map((r) => r.v), .5)} 일수 p50=${pct(wins.map((r) => r.s.day), .5)} (${(pct(wins.map((r) => r.s.day), .5) / 365).toFixed(1)}년)`);
  for (const m of [10000, 100000, 1000000]) { const hit = res.filter((r) => r.ms[m]); if (hit.length) console.log(`  ${m / 10000}만 도달 ${hit.length}/${res.length}: 편수 p50=${pct(hit.map((r) => r.ms[m].v), .5)} 일수 p50=${pct(hit.map((r) => r.ms[m].day), .5)} (${(pct(hit.map((r) => r.ms[m].day), .5) / 365).toFixed(2)}년)`); }
  for (const oc of Object.keys(cnt).filter((k) => k !== 'win')) { const f = res.filter((r) => r.outcome === oc); console.log(`  [${oc}] ${f.length}건: 종료일 p50=${pct(f.map((r) => r.s.day), .5)}일(${(pct(f.map((r) => r.s.day), .5) / 365).toFixed(2)}년) 편수 p50=${pct(f.map((r) => r.v), .5)} 구독자 p50=${pct(f.map((r) => r.s.subs), .5)} p90=${pct(f.map((r) => r.s.subs), .9)}`); }
  console.log(`  번아웃 복귀 평균 ${(res.reduce((a, r) => a + (r.s.burnouts ?? 0), 0) / res.length).toFixed(2)}회/런, 1회 이상 ${res.filter((r) => r.s.burnouts > 0).length}/${res.length}, 정체 reachMult<1 종료 ${res.filter((r) => (r.s.reachMult ?? 1) < 1).length}/${res.length}`);
  const bands = [[1e4, 1e5], [1e5, 1e6]];
  for (const [lo, hi] of bands) {
    const rs = res.flatMap((r) => r.s.videos.map((v) => { const sb = Math.max(1, 0); return v; }).filter(() => false));
  }
  const rat = (lo, hi) => res.flatMap((r) => { let sub = bal.start.subs; const out = []; for (const v of r.s.videos) { if (sub >= lo && sub < hi) out.push(v.views / sub); sub += v.subGain; } return out; });
  for (const [lo, hi] of bands) { const a = rat(lo, hi); if (a.length) console.log(`  조회수/구독자 비율 (구독 ${lo / 1e4}만~${hi / 1e4}만) n=${a.length} p10=${pct(a, .1).toFixed(2)} p50=${pct(a, .5).toFixed(2)} p90=${pct(a, .9).toFixed(2)}`); }
  const rev = res.map((r) => r.s.stats.revenue), spent = res.map((r) => r.s.stats.spent);
  console.log(`  수익 p50=${pct(rev, .5)} 지출 p50=${pct(spent, .5)} 대출잔액 p50=${pct(res.map((r) => r.s.loan), .5)}`);
}
