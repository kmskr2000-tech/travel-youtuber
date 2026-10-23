// 일정 플래너 순수 로직 (UI 비의존). 엔진 evaluatePlan/resolveTrip 위의 얇은 래퍼.
import { findCard, KINDS } from '../engine/trip.js';
import { resolveTrip } from '../engine/game.js';
import { clamp } from '../engine/views.js';

export const SLOT_NAMES = ['오전', '오후', '저녁'];
export const KIND_NAME = { sight: '명소', activity: '액티비티', food: '먹거리' };
export const LODGINGS = [['guesthouse', '게스트하우스'], ['business', '비즈니스'], ['hotel', '호텔']];
export const cardsOf = (dest, kind) => dest[{ sight: 'sights', activity: 'activities', food: 'foods' }[kind]] ?? [];

export function emptyPlan(dest, transport) {
  return { days: dest.recommendedDays?.[0] ?? 3, transport: transport.mode, rental: false, lodging: 'guesthouse', placements: [] };
}

/** day×slot 격자: grid[day-1][slot] = { cardId, head } | null (2슬롯 카드는 둘째 칸 head=false) */
export function gridOf(plan, dest) {
  const g = Array.from({ length: plan.days }, () => [null, null, null]);
  for (const p of plan.placements) {
    const c = findCard(dest, p.cardId);
    if (!c || p.day < 1 || p.day > plan.days) continue;
    for (let k = 0; k < c.slots; k++) if (p.slot + k < 3) g[p.day - 1][p.slot + k] = { cardId: p.cardId, head: k === 0 };
  }
  return g;
}

/** 카드 배치 시도. 성공 { plan }, 실패 { error }. 이미 배치된 카드는 이동으로 처리 */
export function placeCard(plan, dest, cardId, day, slot) {
  const c = findCard(dest, cardId);
  if (!c) return { error: '카드를 찾을 수 없어요' };
  if (day < 1 || day > plan.days) return { error: '없는 날짜예요' };
  if (slot + c.slots > 3) return { error: '하루를 넘길 수 없어요' };
  const rest = { ...plan, placements: plan.placements.filter((p) => p.cardId !== cardId) };
  const g = gridOf(rest, dest);
  for (let k = 0; k < c.slots; k++) if (g[day - 1][slot + k]) return { error: '이미 다른 카드가 있어요' };
  return { plan: { ...rest, placements: [...rest.placements, { cardId, day, slot }] } };
}

export const removeCard = (plan, cardId) => ({ ...plan, placements: plan.placements.filter((p) => p.cardId !== cardId) });

/** 체류일 변경: 범위 밖 배치는 제거 */
export function setDays(plan, days) {
  const d = clamp(days, 1, 7);
  return { ...plan, days: d, placements: plan.placements.filter((p) => p.day <= d) };
}

/** 배치된 같은 카테고리 편중 안내 (다양성은 카테고리 3종 충족도) */
export function diversityInfo(kinds) {
  const set = new Set(kinds);
  return { count: set.size, missing: KINDS.filter((k) => !set.has(k)).map((k) => KIND_NAME[k]) };
}

/** 확정 버튼 상태: 오류 없음 + 카드 1개 이상 + (현금 or 현금+대출) 가능 */
export function confirmState(state, pv) {
  if (!pv.ok) return { enabled: false, loan: 0, label: '일정 확정 ▶', reason: pv.errors[0] };
  if (pv.slotsUsed === 0) return { enabled: false, loan: 0, label: '일정 확정 ▶', reason: '카드를 1개 이상 배치하세요' };
  if (!pv.affordable) return { enabled: false, loan: 0, label: '예산 초과', reason: '현금과 대출 한도를 넘어요' };
  const loan = Math.max(0, pv.cost.total - state.cash);
  return loan > 0
    ? { enabled: true, loan, label: '대출로 확정 ▶', reason: '' }
    : { enabled: true, loan: 0, label: '일정 확정 ▶', reason: '' };
}

/** 이벤트 선택을 UI가 순차 수집할 수 있게 하는 재생(replay) 해석. 엔진은 시드 고정이라 같은 선택이면 같은 결과.
 *  반환: { pending: { event, tag, index } } 또는 { state, report } */
export function resolveWithChoices(state, dest, plan, opts, data, bal, choices) {
  let i = 0;
  const stop = { pending: null };
  try {
    return resolveTrip(state, dest, plan, {
      ...opts,
      choose(event, tag) {
        if (i < choices.length) return choices[i++];
        stop.pending = { event, tag, index: i };
        throw stop;
      },
    }, data, bal);
  } catch (e) {
    if (e === stop) return { pending: stop.pending };
    throw e;
  }
}

/** 편집일 0~max별 예상 품질 (이벤트 선택 확정 후 호출) */
export function qualityByEditDays(state, dest, plan, style, data, bal, choices) {
  const out = [];
  for (let d = 0; d <= bal.edit.maxDays; d++) {
    const r = resolveWithChoices(state, dest, plan, { editDays: d, style }, data, bal, choices);
    out.push(r.report?.Q ?? null);
  }
  return out;
}
