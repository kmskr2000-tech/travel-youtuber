// §4.1 공통 상단 지표 바: 값 변화 시 롤링 카운트업 + ±칩
import { h } from '../util/h.js';
import { num, won, views, signed, compact, dateLabel } from '../util/format.js';
import { monthOf } from '../engine/economy.js';
import { staminaCap } from '../engine/burnout.js';
import { rollNumber } from '../util/fx.js';

export const CHANNEL_NAME = '내 여행 채널';

export function createMetrics(bal) {
  const cell = (cls, icon, fmt, label) => {
    const val = h('b', { class: 'v' }, '–'), chip = h('span', { class: 'chip', hidden: true });
    return { cls, fmt, val, chip, last: null, el: h('div', { class: `m ${cls}`, role: 'group', 'aria-label': label }, h('span', { class: 'ic', 'aria-hidden': 'true' }, icon), val, chip) };
  };
  const subs = cell('subs', '👥', num, '구독자'), cash = cell('cash', '💰', won, '보유 현금'), vw = cell('views', '▶', views, '누적 조회수');
  const rep = cell('rep', '⭐', (v) => `명성 ${Math.round(v)}`, '명성');
  const gauge = h('i', { class: 'gauge-fill' });
  const stText = h('b', { class: 'v' });
  const stam = h('div', { class: 'm stamina', title: '체력', role: 'group', 'aria-label': '체력' }, h('span', { class: 'ic', 'aria-hidden': 'true' }, '❤'), h('div', { class: 'gauge', role: 'progressbar', 'aria-label': '체력 게이지', 'aria-valuemin': 0, 'aria-valuemax': 100 }, gauge), stText);
  const date = h('div', { class: 'date', role: 'status' });
  const skill = h('div', { class: 'skill' });
  const bar = h('header', { class: 'metrics', role: 'banner' },
    h('div', { class: 'brand' }, '▶ ', h('b', {}, CHANNEL_NAME)),
    subs.el, cash.el, stam, rep.el, vw.el,
    h('div', { class: 'sub-row' }, date, skill));

  function update(s) {
    for (const [c, v] of [[subs, s.subs], [cash, s.cash], [vw, s.views], [rep, s.reputation]]) {
      if (c.last === null) c.val.textContent = c.fmt(v);
      else if (c.last !== v) {
        rollNumber(c.val, c.last, v, c.fmt);
        if (c !== rep && c !== vw) {
          c.chip.textContent = signed(v - c.last, c === cash ? compact : num);
          c.chip.className = `chip ${v > c.last ? 'up' : 'down'}`;
          c.chip.hidden = false;
          setTimeout?.(() => { c.chip.hidden = true; }, 2200);
        }
      }
      c.last = v;
    }
    const cap = staminaCap(s.subs, bal);
    gauge.style.width = `${Math.max(0, Math.min(100, (s.stamina / bal.stamina.max) * 100))}%`;
    gauge.className = `gauge-fill ${s.stamina <= bal.stamina.warn ? 'low' : ''}`;
    stText.textContent = `${Math.round(s.stamina)}/${cap}`;
    gauge.parent?.setAttribute?.('aria-valuenow', String(Math.round(s.stamina)));
    date.textContent = dateLabel(s.day, monthOf);
    skill.textContent = `📷 Lv${s.shootLv}  ✂ Lv${s.editLv}`;
    if (s.loan > 0) skill.textContent += `  · 대출 ${compact(s.loan)}원`;
  }
  return { el: bar, update };
}
