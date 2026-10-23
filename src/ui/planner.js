// §4.5 카드 플래너: 카드를 탭해 선택 → 빈 슬롯을 탭해 배치 (드래그 없이 모바일 동작)
import { h, clear, append } from '../util/h.js';
import { won, signed } from '../util/format.js';
import { previewTrip } from '../engine/game.js';
import { findCard } from '../engine/trip.js';
import { emptyPlan, gridOf, placeCard, removeCard, setDays, confirmState, diversityInfo,
  cardsOf, SLOT_NAMES, KIND_NAME, LODGINGS } from '../util/planner.js';
import { KINDS } from '../engine/trip.js';
import { availableCredit } from '../engine/economy.js';

const gauge = (label, frac, text, cls = '') =>
  h('div', { class: `pgauge ${cls}` }, h('span', { class: 'plabel' }, label),
    h('span', { class: 'gauge' }, h('i', { class: 'gauge-fill', style: { width: `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%` } })),
    h('span', { class: 'ptext' }, text));

export function plannerScreen({ state, bal, dest, transport, plan: initial, nav }) {
  let plan = initial ?? emptyPlan(dest, transport);
  let selected = null; // 선택된 카드 id
  let msg = '';
  const body = h('div', { class: 'pbody' });
  const titleEl = h('b', { class: 'ptitle' }, '');
  const section = h('section', { class: 'screen planner-screen' },
    h('div', { class: 'bar' }, h('button', { class: 'btn back', onclick: () => nav('transport', { dest }) }, '← 이동수단'),
      titleEl), body);

  function update(next) { if (next.error) msg = next.error; else { plan = next.plan ?? next; msg = ''; } redraw(); }

  function slotCell(g, day, slot, pv) {
    const cell = g[day - 1][slot];
    const label = `Day${day} ${SLOT_NAMES[slot]}`;
    if (!cell) {
      return h('button', { class: `slot empty ${selected ? 'target' : ''}`, 'data-day': day, 'data-slot': slot, title: label, 'aria-label': `${label} 빈 슬롯${selected ? ' — 선택한 카드 배치' : ''}`,
        onclick: () => { if (selected) { const id = selected; selected = null; update(placeCard(plan, dest, id, day, slot)); } } }, SLOT_NAMES[slot]);
    }
    if (!cell.head) return h('div', { class: 'slot cont', 'aria-hidden': 'true' }, '↳');
    const c = findCard(dest, cell.cardId);
    return h('button', { class: `slot filled kind-${c.kind} span${c.slots}`, 'data-day': day, 'data-slot': slot, 'data-id': c.id, title: `${label} · 탭하면 빼기`, 'aria-label': `${label} ${c.name} — 누르면 뺍니다`,
      onclick: () => { selected = null; update(removeCard(plan, c.id)); } }, c.name);
  }

  function redraw() {
    const pv = previewTrip(state, dest, plan, bal);
    const cs = confirmState(state, pv);
    const placed = new Set(plan.placements.map((p) => p.cardId));
    const g = gridOf(plan, dest);
    const pool = Math.max(1, state.cash + availableCredit(state, bal));
    const div = diversityInfo(pv.kinds);
    clear(body);
    const nights = plan.days - 1;
    append(body, [
      h('div', { class: 'pgauges' },
        gauge('예산', pv.cost.total / pool, `${won(pv.cost.total)} / ${won(pool)}`, pv.affordable ? '' : 'over'),
        gauge('예상 체력', Math.max(0, pv.staminaAfter) / 100, `${Math.round(state.stamina)} → ${Math.round(pv.staminaAfter)} (${signed(pv.staminaAfter - state.stamina)})`, pv.staminaAfter <= bal.stamina.warn ? 'low' : '')),
      h('div', { class: 'pcontrols' },
        h('span', {}, '체류 ',
          h('button', { class: 'btn days-dec', disabled: plan.days <= 1, onclick: () => { update(setDays(plan, plan.days - 1)); } }, '−'),
          h('b', { class: 'days' }, ` ${nights}박 ${plan.days}일 `),
          h('button', { class: 'btn days-inc', disabled: plan.days >= 7, onclick: () => { update(setDays(plan, plan.days + 1)); } }, '＋')),
        dest.rentalDayCost ? h('label', {}, h('input', { type: 'checkbox', class: 'rental', checked: plan.rental,
          onchange: (e) => { plan = { ...plan, rental: !plan.rental }; redraw(); } }), ` 렌터카 (${won(dest.rentalDayCost)}/일, 슬롯 보너스)`) : null),
      h('div', { class: 'lodging' }, '숙소 ', LODGINGS.map(([k, name]) =>
        h('button', { class: `btn lodge ${plan.lodging === k ? 'on' : ''}`, 'data-lodging': k, 'aria-pressed': String(plan.lodging === k),
          onclick: () => { plan = { ...plan, lodging: k }; redraw(); } }, `${name} ${won(dest.lodging?.[k] ?? 0)}`))),
      h('p', { class: 'slotinfo' }, `슬롯 ${pv.slotsUsed}/${pv.slotsAvail} 사용 · 이동 후 남은 칸 기준`),
      h('div', { class: 'pgrid' }, g.map((_, d) => h('div', { class: 'pday' }, h('h5', {}, `Day ${d + 1}`),
        [0, 1, 2].map((s) => slotCell(g, d + 1, s, pv))))),
      h('div', { class: 'ppool' }, KINDS.map((k) => h('div', { class: 'pgroup', 'data-kind': k }, h('h5', {}, KIND_NAME[k]),
        cardsOf(dest, k).map((c) => h('button', { class: `pcard kind-${k} ${placed.has(c.id) ? 'placed' : ''} ${selected === c.id ? 'sel' : ''}`, 'data-id': c.id, 'aria-pressed': String(selected === c.id),
          onclick: () => { selected = selected === c.id ? null : c.id; msg = ''; redraw(); } },
          h('b', {}, `${c.name}${c.slots > 1 ? ` (${c.slots}칸)` : ''}`),
          h('span', {}, `${won(c.cost)} · 점수 ${c.points} · 피로 ${c.fatigue}`),
          c.tags?.length ? h('span', { class: 'tags' }, c.tags.map((t) => `#${t}`).join(' ')) : null))))),
      div.count < 3 && pv.slotsUsed ? h('p', { class: 'hint' }, `다양성: 카테고리 ${div.count}/3 (${div.missing.join('·')} 추가하면 점수↑)`) : null,
      h('dl', { class: 'costs' }, ['transport', 'lodging', 'food', 'cards', 'rental'].filter((k) => pv.cost[k] || k === 'transport').map((k) =>
        [h('dt', {}, { transport: '왕복 교통', lodging: '숙박', food: '식비', cards: '카드', rental: '렌터카' }[k]), h('dd', {}, won(pv.cost[k]))])),
      msg || cs.reason ? h('p', { class: 'warn', role: 'alert' }, msg || cs.reason) : null,
      cs.loan ? h('p', { class: 'alert' }, `현금 부족분 ${won(cs.loan)}은 대출로 충당돼요 (월 2% 이자)`) : null,
      h('button', { class: 'btn primary confirm', disabled: !cs.enabled, onclick: () => nav('shoot', { dest, transport, plan }) }, cs.label)]);
    titleEl.textContent = `${dest.name} ${nights}박 ${plan.days}일`;
  }
  redraw();
  return section;
}
