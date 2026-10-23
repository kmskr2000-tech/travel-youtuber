// §4.1 공통 상단 지표 바: 값 변화 시 롤링 카운트업 + ±칩
import { h } from '../util/h.js';
import { num, won, views, signed, compact, dateLabel } from '../util/format.js';
import { monthOf } from '../engine/economy.js';
import { staminaCap } from '../engine/burnout.js';

export const CHANNEL_NAME = '내 여행 채널';

function rollNumber(el, from, to, fmt, ms = 600) {
  if (from === to || typeof requestAnimationFrame !== 'function') { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = fmt(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function createMetrics(bal) {
  const cell = (cls, icon, fmt) => {
    const val = h('b', { class: 'v' }, '–'), chip = h('span', { class: 'chip', hidden: true });
    return { cls, fmt, val, chip, last: null, el: h('div', { class: `m ${cls}` }, h('span', { class: 'ic', 'aria-hidden': 'true' }, icon), val, chip) };
  };
  const subs = cell('subs', '👥', num), cash = cell('cash', '💰', won), vw = cell('views', '▶', views);
  const rep = cell('rep', '⭐', (v) => `명성 ${Math.round(v)}`);
  const gauge = h('i', { class: 'gauge-fill' });
  const stText = h('b', { class: 'v' });
  const stam = h('div', { class: 'm stamina', title: '체력' }, h('span', { class: 'ic', 'aria-hidden': 'true' }, '❤'), h('div', { class: 'gauge' }, gauge), stText);
  const date = h('div', { class: 'date' });
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
    date.textContent = dateLabel(s.day, monthOf);
    skill.textContent = `📷 Lv${s.shootLv}  ✂ Lv${s.editLv}`;
    if (s.loan > 0) skill.textContent += `  · 대출 ${compact(s.loan)}원`;
  }
  return { el: bar, update };
}
