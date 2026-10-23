export const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
export const num = (n) => Math.round(n).toLocaleString('ko-KR');
export function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (a >= 1e4) return `${(n / 1e4).toFixed(a >= 1e6 ? 0 : 1)}만`;
  return num(n);
}
export function views(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
export const signed = (n, f = num) => (n > 0 ? '+' : n < 0 ? '−' : '±') + f(Math.abs(n));
export const START_YEAR = 2027;
/** 엔진 monthOf(day)와 같은 기준의 표기 (실달력 불일치 방지) */
export function dateLabel(day, monthOf) {
  return `Day ${day} · ${START_YEAR + Math.floor((day - 1) / 365)}년 ${monthOf(day)}월`;
}
