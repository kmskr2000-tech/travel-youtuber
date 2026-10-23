// 여행 1회(코어 루프) 처리: 비용 지불 → 촬영 → 편집 → 업로드 → 정산. 순수 함수.
import { makeRng } from './rng.js';
import { evaluatePlan } from './trip.js';
import { pay, earn, advanceDays, canAfford, monthOf, loanLimit } from './economy.js';
import { pickEvent, sumEffects } from './events.js';
import { staminaCap, soloMult, stagnationUpdate } from './burnout.js';
import { contentScore, editScore, quality, trendMult, computeViews, noveltyMult, distanceMult, computeSubGain, adRevenue,
  sponsorChance, sponsorAmount, clamp } from './views.js';

const levelUp = (lv, xp, bal) => {
  while (lv < bal.skill.maxLv && xp >= bal.skill.xpPerLevel * lv) { xp -= bal.skill.xpPerLevel * lv; lv++; }
  return [lv, xp];
};

/** 체력 변화: 회복 − 피로×단독운영 배율 (구독자 10만+) */
export const tripStaminaDelta = (ev, subs, bal) => ev.recover - Math.round(ev.fatigue * soloMult(subs, bal));

/** 확정 전 미리보기 (UI 플래너용) */
export function previewTrip(state, dest, plan, bal) {
  const ev = evaluatePlan(dest, plan, bal);
  return { ...ev, affordable: canAfford(state, ev.cost.total, bal), staminaAfter: state.stamina + tripStaminaDelta(ev, state.subs, bal) };
}

/**
 * data = { events, trends }, opts = { editDays, style, choose(event, ctx) => 선택지 index }
 * 반환 { state, report }
 */
export function resolveTrip(state0, dest, plan, opts, data, bal) {
  if (state0.over || state0.ended) throw new Error('게임이 이미 종료됨');
  const rng = makeRng(state0.rngState);
  const ev = evaluatePlan(dest, plan, bal);
  if (!ev.ok) throw new Error('일정 오류: ' + ev.errors.join(', '));
  if (!canAfford(state0, ev.cost.total, bal)) throw new Error('예산 부족');

  const editDays = clamp(opts.editDays ?? 0, 0, bal.edit.maxDays);
  const style = opts.style ?? 'info';
  const choose = opts.choose ?? (() => 0);
  const log = [];
  let s = pay(state0, ev.cost.total, bal);
  s.stats = { ...s.stats, spent: s.stats.spent + ev.cost.total };
  if (s.over) return finish(s, state0, rng, { log, ev, cancelled: true });

  let W = 0.5, stamina = s.stamina, extraCost = 0, extraDays = 0, repDelta = 0;
  const apply = (event, ctxTag) => {
    const idx = Math.min(choose(event, ctxTag) ?? 0, event.choices.length - 1);
    const e = sumEffects(event.choices[idx].effects);
    stamina += e.stamina; W += e.W; extraCost += e.cost; extraDays += e.days; repDelta += e.rep;
    log.push({ event: event.id, choice: event.choices[idx].label });
  };
  const month = monthOf(s.day);
  const ctx = (trigger, extra = {}) => ({ trigger, month, dest, subs: s.subs, stamina, ...extra });

  // 이동 이벤트
  if (rng.chance(bal.events.slotChance)) {
    const e = pickEvent(data.events, ctx('transport', { mode: plan.transport }), rng);
    if (e) apply(e, 'transport');
  }
  // 촬영: 슬롯 진행. 시작 체력에서 이동·활동 피로를 먼저 반영, 야간 회복은 하루 단위 안분
  const cap = staminaCap(s.subs, bal);
  stamina = Math.min(stamina, cap) + tripStaminaDelta(ev, s.subs, bal);
  const slotCount = plan.days * 3;
  for (let i = 0; i < slotCount; i++) {
    if (!rng.chance(bal.events.slotChance)) continue;
    const e = pickEvent(data.events, ctx('slot', { stamina }), rng);
    if (e) apply(e, 'slot');
  }
  if (extraCost > 0) { s = pay(s, extraCost, bal); s.stats = { ...s.stats, spent: s.stats.spent + extraCost }; }
  stamina = clamp(stamina, -1, cap);
  if (stamina <= 0) { // 번아웃: 게임오버 아님. 업로드 불발 + 강제 휴식 후 복귀
    const b = bal.burnout;
    s = advanceDays({ ...s, stamina: Math.min(cap, b.recoverTo), burnouts: (s.burnouts ?? 0) + 1,
      reputation: clamp(s.reputation - b.repLoss, 0, 100), lowStreak: 0 }, ev.totalDays + extraDays + b.restDays, bal);
    return finish(s, state0, rng, { log, ev, burnout: true, restDays: b.restDays });
  }

  // 편집일: 체력 회복 + 날짜 경과
  stamina = Math.min(cap, stamina + editDays * bal.stamina.editDay);
  const daysPassed = ev.totalDays + extraDays + editDays;

  // 품질
  const C = contentScore({ pointsSum: ev.pointsSum, slotsUsed: ev.slotsUsed, slotsAvail: ev.slotsAvail, kinds: ev.kinds }, bal);
  const E = editScore(s.editLv, editDays, bal);
  let Q = quality({ C, shootLv: s.shootLv, E, W: clamp(W, 0, 1) }, bal);
  Q = clamp(Q * (1 + ev.videoBonus), bal.quality.min, bal.quality.max);

  // 업로드
  const T = trendMult({ tags: ev.tags, month, bestSeason: dest.bestSeason }, data.trends, bal);
  const viral = rng.chance(bal.viral.chance);
  const upDay = s.day + daysPassed;
  const firstVisit = !s.visited.includes(dest.id);
  const trn = dest.transports.find((x) => x.mode === plan.transport);
  const N = noveltyMult(trn?.durationMin ?? 0, firstVisit, bal);
  const Dm = distanceMult(trn?.durationMin ?? 0, dest.region, bal);
  const views = computeViews({ subs: s.subs, rep: s.reputation, Q, P: dest.popularity, T, viral, N, Dm, R: s.reachMult ?? 1 }, bal);
  const subGain = computeSubGain(views, Q, style, bal);
  const ad = adRevenue(views, bal);
  const st = bal.titleStyles[style] ?? bal.titleStyles.info;

  // 업로드 이벤트
  if (rng.chance(bal.events.uploadChance)) {
    const e = pickEvent(data.events, ctx('upload'), rng);
    if (e) apply(e, 'upload');
  }

  // 스킬 XP
  const xp = ev.slotsUsed * bal.skill.xpPerSlot;
  let [shootLv, shootXp] = levelUp(s.shootLv, s.shootXp + xp, bal);
  let [editLv, editXp] = levelUp(s.editLv, s.editXp + xp / 2 + editDays * bal.skill.xpPerSlot, bal);

  // 협찬 의무 이행 확인
  let sponsorPending = s.sponsorPending;
  let sponsorNote = null;
  if (sponsorPending && ev.tags.includes(sponsorPending.tag)) { repDelta += 2; sponsorNote = 'fulfilled'; sponsorPending = null; }

  const stag = stagnationUpdate(s, views, bal);
  s = advanceDays({ ...s, ...stag, stamina: Math.round(stamina), lastUploadDay: upDay }, daysPassed, bal);
  s = earn(s, ad);
  if (s.sponsorPending && sponsorPending === s.sponsorPending && s.day > s.sponsorPending.dueDay) {
    repDelta -= bal.sponsor.penaltyRep;
    s = pay(s, s.sponsorPending.penalty, bal);
    sponsorNote = 'penalty'; sponsorPending = null;
  }
  s = {
    ...s,
    subs: s.subs + subGain,
    views: s.views + views,
    reputation: clamp(s.reputation + st.rep + repDelta, 0, 100),
    shootLv, shootXp, editLv, editXp, sponsorPending,
    visited: s.visited.includes(dest.id) ? s.visited : [...s.visited, dest.id],
    stats: { ...s.stats, uploads: s.stats.uploads + 1 },
  };
  s.videos = [...s.videos, { day: upDay, dest: dest.id, views, subGain, ad, Q: +Q.toFixed(3), viral, style }];
  if (!s.over && s.subs >= bal.win.subs) s.ended = { type: 'win', day: s.day };
  return finish(s, state0, rng, { log, ev, views, subGain, ad, Q, T, C, E, N, firstVisit, viral, daysPassed, sponsorNote });
}

function finish(s, state0, rng, report) {
  return { state: { ...s, rngState: rng.state }, report };
}

/** 스튜디오 복귀 시 협찬 제안 판정 */
export function rollSponsor(state, bal, rng) {
  if (state.sponsorPending) return null;
  if (!rng.chance(sponsorChance(state.subs, state.reputation, bal))) return null;
  const amount = sponsorAmount(state.subs, bal);
  return { amount, tag: rng.pick(['자연', '먹방', '로컬', '액티비티', '뷰']), dueDays: bal.sponsor.dueDays,
           penalty: Math.round(amount * bal.sponsor.penaltyRate) };
}
export function acceptSponsor(state, offer, bal) {
  return { ...earn(state, offer.amount), sponsorPending: { tag: offer.tag, dueDay: state.day + offer.dueDays, penalty: offer.penalty } };
}

/** 휴식(스튜디오): 하루 +25, 날짜 1일 경과 */
export function rest(state, days, bal) {
  const n = advanceDays(state, days, bal);
  return { ...n, stamina: Math.min(staminaCap(n.subs, bal), n.stamina + days * bal.stamina.restDay) };
}

/** 스킬 훈련 구매: Lv n → n+1 비용 50,000 × n */
export function trainSkill(state, which, bal) {
  const lv = which === 'shoot' ? state.shootLv : state.editLv;
  if (lv >= bal.skill.maxLv) throw new Error('최대 레벨');
  const cost = bal.skill.trainCostPerLevel * lv;
  if (!canAfford(state, cost, bal)) throw new Error('예산 부족');
  const s = pay(state, cost, bal);
  return which === 'shoot' ? { ...s, shootLv: lv + 1, shootXp: 0 } : { ...s, editLv: lv + 1, editXp: 0 };
}
export { loanLimit };
