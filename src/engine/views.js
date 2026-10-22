// 조회수·구독자·수익 계산 (순수 함수). 수치는 balance.json.
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v) => clamp(v, 0, 1);

/** 기본 도달률 r = 0.10 + 0.20 × 명성/100 */
export function reachRate(rep, bal) {
  return bal.reach.min + (bal.reach.max - bal.reach.min) * clamp01(rep / 100);
}

/** 콘텐츠 구성 점수 C (0~1) */
export function contentScore({ pointsSum, slotsUsed, slotsAvail, kinds }, bal) {
  const c = bal.content;
  const avg = slotsUsed > 0 ? pointsSum / slotsUsed : 0;
  const norm = clamp01(avg / c.pointsRef);
  const fill = slotsAvail > 0 ? clamp01(slotsUsed / slotsAvail) : 0;
  const diversity = clamp01(new Set(kinds).size / 3);
  return clamp01(c.wPoints * norm + c.wFill * fill + c.wDiversity * diversity);
}

/** 편집 점수 E = ((편집Lv-1)/9) × (0.6 + 0.4 × min(편집일,3)/3) */
export function editScore(editLv, editDays, bal) {
  const d = Math.min(editDays, bal.edit.maxDays);
  return clamp01((editLv - 1) / (bal.skill.maxLv - 1)) * (bal.edit.base + bal.edit.perDay * d / bal.edit.maxDays);
}

/** 품질계수 Q = 0.5 + 1.5 × (0.40C + 0.25S + 0.25E + 0.10W), 0.5~2.0 */
export function quality({ C, shootLv, E, W = 0.5 }, bal) {
  const q = bal.quality;
  const S = clamp01((shootLv - 1) / (bal.skill.maxLv - 1));
  const raw = q.wC * C + q.wS * S + q.wE * E + q.wW * clamp01(W);
  return clamp(q.base + q.span * raw, q.min, q.max);
}

/** 트렌드 T: 일치 트렌드 배율 합산 + 시즌 보정, 0.8~1.5 */
export function trendMult({ tags, month, bestSeason }, trends, bal) {
  let t = 1;
  const tagSet = new Set(tags);
  for (const tr of trends || []) {
    if (tr.months.includes(month) && tagSet.has(tr.tag)) t += tr.multiplier - 1;
  }
  if (bestSeason?.length) t += bestSeason.includes(month) ? bal.trend.onSeason : bal.trend.offSeason;
  return clamp(t, bal.trend.min, bal.trend.max);
}

/**
 * 조회수 = (구독자 × r + D) × Q × P × T × X,  D = 1,500 × Q  (설계서 §2.1, 확정)
 * viral: 이미 굴린 결과(boolean)
 */
export function computeViews({ subs, rep, Q, P, T, viral, N = 1 }, bal) {
  const r = reachRate(rep, bal);
  const D = bal.discovery.perQ * Q;
  const pop = clamp(P, bal.popularity.min, bal.popularity.max);
  const X = viral ? bal.viral.mult : 1;
  return Math.max(0, Math.round((subs * r + D) * Q * pop * T * X * N));
}

/** ΔS = V × c × (0.6 + 0.4 × Q/2) × 제목계수 */
export function computeSubGain(views, Q, style, bal) {
  const st = bal.titleStyles[style] ?? bal.titleStyles.info;
  return Math.round(views * bal.conversion * (0.6 + 0.4 * Q / 2) * st.mult);
}

/** 광고 수익 = 조회수/1000 × CPM */
export const adRevenue = (views, bal) => Math.round(views / 1000 * bal.cpm);

/** 협찬 금액: 500,000 + (log10(구독자)-4) × 1,500,000, 최대 5,000,000 */
export function sponsorAmount(subs, bal) {
  const s = bal.sponsor;
  const raw = s.base + (Math.log10(Math.max(subs, 1)) - 4) * s.perLog10;
  return Math.round(clamp(raw, s.base, s.max) / 10000) * 10000;
}

/** 협찬 제안 확률 = min(0.5, 구독자/400,000) × 명성/100 */
export function sponsorChance(subs, rep, bal) {
  const s = bal.sponsor;
  if (subs < s.minSubs) return 0;
  return Math.min(s.maxProb, subs / s.probDivisor) * clamp01(rep / 100);
}

/**
 * 첫 방문 신선도 보너스 N (승인 2026-10-22): 첫 방문 시 x1.3~2.0, 재방문 x1.
 * 편도 소요시간이 길수록(먼 곳일수록) 큼. nearMin 이하=min, farMin 이상=max, 선형 보간.
 */
export function noveltyMult(durationMin, firstVisit, bal) {
  if (!firstVisit) return 1;
  const n = bal.novelty;
  const f = clamp01((durationMin - n.nearMin) / (n.farMin - n.nearMin));
  return +(n.min + (n.max - n.min) * f).toFixed(4);
}
