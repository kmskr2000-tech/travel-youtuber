// §4.4 이동수단 선택
import { h } from '../util/h.js';
import { won, num } from '../util/format.js';
import { legCost } from '../engine/trip.js';
import { availableCredit } from '../engine/economy.js';

const MODE_ICON = { fsc: '✈', lcc: '✈', ktx: '🚄', bus: '🚌', ferry: '⛴', cruise: '🛳', car: '🚗' };
const HIGHLIGHT = new Set(['ferry', 'cruise']);

export const durText = (min) => `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}`;
export const approx = (t, s) => (t.estimated ? `약 ${s}` : s);

/** 이동수단 카드의 예산 영향: 왕복 요금 vs 현금+가용대출 */
export function budgetImpact(state, t, bal) {
  const pool = state.cash + availableCredit(state, bal);
  return { fare: t.costRoundTrip, ratio: pool > 0 ? Math.min(1, t.costRoundTrip / pool) : 1, affordable: t.costRoundTrip <= pool };
}

export function transportScreen({ state, bal, dest, nav }) {
  const cards = dest.transports.map((t) => {
    const leg = legCost(t.durationMin, bal);
    const imp = budgetImpact(state, t, bal);
    const legTxt = leg.days ? `이동일 ${leg.days}일 (편도)` : `슬롯 ${leg.slots}칸 (편도)`;
    return h('article', { class: `tcard ${HIGHLIGHT.has(t.mode) ? 'hl' : ''} ${imp.affordable ? '' : 'poor'}`, 'data-mode': t.mode },
      HIGHLIGHT.has(t.mode) ? h('span', { class: 'badge' }, '크루즈·선박 특집') : null,
      h('h4', {}, `${MODE_ICON[t.mode] ?? '🧳'} ${t.name}`),
      h('dl', {},
        h('dt', {}, '왕복 요금'), h('dd', {}, approx(t, won(t.costRoundTrip))),
        h('dt', {}, '소요'), h('dd', {}, `${durText(t.durationMin)} · ${legTxt}`),
        h('dt', {}, '피로'), h('dd', {}, `편도 ${t.fatigue}`),
        h('dt', {}, '영상 보너스'), h('dd', {}, t.videoBonus ? `+${Math.round(t.videoBonus * 100)}%` : '–')),
      h('div', { class: 'impact', title: '현금+가용 대출 대비 요금 비중' },
        h('i', { style: { width: `${Math.round(imp.ratio * 100)}%` } }), h('span', {}, `예산의 ${Math.round(imp.ratio * 100)}%`)),
      h('button', { class: 'btn primary pick', disabled: !imp.affordable, onclick: () => nav('stub', { dest, transport: t }) },
        imp.affordable ? '이 수단으로' : '예산 부족'));
  });
  return h('section', { class: 'screen transport-screen' },
    h('div', { class: 'bar' }, h('button', { class: 'btn back', onclick: () => nav('map') }, '← 지도'), h('b', {}, `${dest.name} · 이동수단`)),
    h('div', { class: 'tlist' }, cards));
}
