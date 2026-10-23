// 번아웃(휴식-복귀)·고구독자 피로 스케일·하락형 정체 (순수 함수). 수치는 balance.json.
import { clamp01 } from './views.js?v=1792737762';

/** 구독자 규모 진행도 f: fromSubs 이하 0, toSubs 이상 1 (선형) */
export function scaleF(subs, bal) {
  const b = bal.burnout;
  return clamp01((subs - b.fromSubs) / (b.toSubs - b.fromSubs));
}

/** 현재 체력 상한: 100 → 구독자 10만~100만 구간에서 staminaFloor까지 선형 하향 */
export function staminaCap(subs, bal) {
  const f = scaleF(subs, bal);
  return Math.round(bal.stamina.max - (bal.stamina.max - bal.burnout.staminaFloor) * f);
}

/** 단독 운영 피로 배율: 1.0 → soloMax (구독자 10만~100만) */
export function soloMult(subs, bal) {
  return +(1 + (bal.burnout.soloMax - 1) * scaleF(subs, bal)).toFixed(4);
}

/**
 * 하락형 정체 갱신. ratio = 조회수/업로드 전 구독자.
 * 구독자 minSubs 이상에서 ratio < ratioLow 가 연속 streakN편 이상이면 reachMult 감소, 회복 시 점진 복구.
 */
export function stagnationUpdate(s, views, bal) {
  const g = bal.stagnation;
  let streak = s.lowStreak ?? 0, mult = s.reachMult ?? 1;
  const ratio = views / Math.max(1, s.subs);
  if (s.subs >= g.minSubs && ratio < g.ratioLow) {
    streak += 1;
    if (streak >= g.streakN) mult = Math.max(g.minMult, mult * (1 - g.drop));
  } else {
    streak = 0;
    mult = Math.min(1, mult + g.recover);
  }
  return { lowStreak: streak, reachMult: +mult.toFixed(4) };
}
