// 일정 검증·비용·체력·소요일 계산 (순수 함수)
import { clamp01 } from './views.js?v=1792737762';

export const KINDS = ['sight', 'activity', 'food'];
const KIND_KEY = { sight: 'sights', activity: 'activities', food: 'foods' };

export function findTransport(dest, mode) {
  return dest.transports.find((t) => t.mode === mode);
}

/** 편도 이동: 6h 이하 슬롯 1칸 / 6~12h 이동일 1 / 12h 초과 이동일 2 (설계서 §1.5) */
export function legCost(durationMin, bal) {
  const t = bal.travel;
  if (durationMin <= t.shortMin) return { days: 0, slots: 1 };
  if (durationMin <= t.midMin) return { days: t.midDays, slots: 0 };
  return { days: t.longDays, slots: 0 };
}

export function findCard(dest, cardId) {
  for (const kind of KINDS) {
    const c = dest[KIND_KEY[kind]]?.find((x) => x.id === cardId);
    if (c) return { ...c, kind };
  }
  return null;
}

/**
 * plan = { days, transport, rental, lodging, placements: [{cardId, day, slot}] }
 *  - days: 현지 체류일 1~7, day: 1~days, slot: 0~2
 * 반환: { ok, errors, ... 비용/체력/일수/콘텐츠 입력 }
 */
export function evaluatePlan(dest, plan, bal) {
  const errors = [];
  const priceMult = bal.priceLevelMult[dest.priceLevel - 1] ?? 1;
  const tr = findTransport(dest, plan.transport);
  if (!tr) errors.push(`이동수단 없음: ${plan.transport}`);
  if (!(plan.days >= 1 && plan.days <= 7)) errors.push('체류일은 1~7일');
  if (plan.rental && !dest.rentalDayCost) errors.push('이 여행지는 렌터카 불가');

  const leg = tr ? legCost(tr.durationMin, bal) : { days: 0, slots: 1 };
  const travelDays = leg.days * 2;
  const travelSlots = leg.slots * 2;
  const rentalBonus = plan.rental ? Math.floor(plan.days / 2) * bal.rental.bonusSlotsPerTwoDays : 0;
  const slotsTotal = plan.days * 3;
  const slotsAvail = Math.max(0, slotsTotal - travelSlots + rentalBonus);

  // 배치 검증
  const used = new Map();
  const seen = new Set();
  let slotsUsed = 0, pointsSum = 0, cardCost = 0, cardFatigue = 0;
  const kinds = [], tags = [];
  const cards = [];
  for (const p of plan.placements ?? []) {
    const card = findCard(dest, p.cardId);
    if (!card) { errors.push(`카드 없음: ${p.cardId}`); continue; }
    if (seen.has(p.cardId)) errors.push(`중복 카드: ${p.cardId}`);
    seen.add(p.cardId);
    if (p.day < 1 || p.day > plan.days || p.slot < 0 || p.slot > 2) errors.push(`슬롯 범위 오류: ${p.cardId}`);
    if (p.slot + card.slots > 3) errors.push(`하루 경계를 넘음: ${p.cardId}`);
    for (let k = 0; k < card.slots; k++) {
      const key = `${p.day}:${p.slot + k}`;
      if (used.has(key)) errors.push(`슬롯 충돌 ${key}: ${p.cardId}`);
      used.set(key, p.cardId);
    }
    slotsUsed += card.slots;
    pointsSum += card.points * card.slots;
    cardCost += card.cost;
    cardFatigue += card.fatigue;
    kinds.push(card.kind);
    tags.push(...(card.tags ?? []));
    cards.push(card);
  }
  if (slotsUsed > slotsAvail) errors.push(`슬롯 초과 ${slotsUsed}/${slotsAvail}`);

  const nights = Math.max(0, plan.days - 1 + (travelDays ? 0 : 0));
  const lodgeRate = dest.lodging?.[plan.lodging] ?? 0;
  const cost = {
    transport: tr ? tr.costRoundTrip : 0,
    lodging: Math.round(nights * lodgeRate * priceMult),
    food: Math.round(plan.days * bal.foodPerDay * priceMult),
    cards: cardCost,
    rental: plan.rental ? (dest.rentalDayCost ?? 0) * plan.days : 0,
  };
  cost.total = cost.transport + cost.lodging + cost.food + cost.cards + cost.rental;

  const recover = nights * (bal.lodgingRecover[plan.lodging] ?? 0);
  const legFatigue = tr ? Math.min(tr.fatigue, bal.travel.fatigueMax ?? 99) : 0;
  const fatigue = legFatigue * 2 + cardFatigue;
  return {
    ok: errors.length === 0,
    errors,
    cost,
    fatigue,
    recover,
    staminaDelta: recover - fatigue,
    travelDays,
    totalDays: plan.days + travelDays,
    slotsAvail,
    slotsUsed,
    pointsSum,
    kinds,
    tags: [...new Set([...tags, ...(dest.tags ?? [])])],
    videoBonus: tr?.videoBonus ?? 0,
    cards,
  };
}
