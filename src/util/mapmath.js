// 지도 투영·필터 순수 함수 (equirectangular, viewBox 360x180)
export const project = ({ lat, lon }) => ({ x: lon + 180, y: 90 - lat });
export const KOREA_VIEW = { x: 123, y: 47, w: 10, h: 10 };
export const WORLD_VIEW = { x: 0, y: 0, w: 360, h: 180 };

export function clampView(v) {
  const w = Math.min(360, Math.max(4, v.w)), h = w / 2;
  return { w, h, x: Math.min(360 - w, Math.max(0, v.x)), y: Math.min(180 - h, Math.max(0, v.y)) };
}
export function zoomView(v, factor, cx, cy) {
  const w = v.w * factor, h = v.h * factor;
  return clampView({ x: cx - (cx - v.x) * factor, y: cy - (cy - v.y) * factor, w, h });
}
export const toViewBox = (v) => `${v.x} ${v.y} ${v.w} ${v.h}`;

/** f = {tab:'domestic'|'overseas', q, tag, price, season(bool: 이번 달 추천만)} */
export function filterDests(dests, f, month) {
  const q = (f.q ?? '').trim().toLowerCase();
  return dests.filter((d) =>
    (f.tab ? d.region === f.tab : true) &&
    (!q || d.name.toLowerCase().includes(q) || d.country.toLowerCase().includes(q)) &&
    (!f.tag || d.tags.includes(f.tag)) &&
    (!f.price || d.priceLevel === Number(f.price)) &&
    (!f.season || d.bestSeason.includes(month)));
}
export const pinRadius = (d, k = 1) => (1.2 + d.popularity * 0.9) * k;
export const isTrending = (d, trends, month) =>
  (trends ?? []).some((t) => d.tags.includes(t.tag) && (!t.months || t.months.includes(month)));
export const allTags = (dests) => [...new Set(dests.flatMap((d) => d.tags))].sort();
