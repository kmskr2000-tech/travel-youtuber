// §4.6 촬영 진행: 슬롯 타임라인 → 이벤트 선택 팝업 → 편집일/제목 스타일 → 업로드
import { h, clear, append } from '../util/h.js';
import { won } from '../util/format.js';
import { focusEl } from '../util/fx.js';
import { findCard } from '../engine/trip.js';
import { resolveWithChoices, qualityByEditDays, SLOT_NAMES } from '../util/planner.js';

const STYLES = [['info', '정보형'], ['emotion', '감성형'], ['bait', '자극형 (평판 −3)']];

export function shootScreen({ state, bal, data, dest, transport, plan, nav, setState }) {
  const choices = [];
  let stage = 'start'; // start → event* → edit | burnout
  let pending = null, last = null, editDays = 0, style = 'info', err = '';
  const body = h('div', { class: 'sbody' });
  const section = h('section', { class: 'screen shoot-screen' },
    h('div', { class: 'bar' }, h('button', { class: 'btn back', onclick: () => nav('planner', { dest, transport, plan }) }, '← 일정 수정'),
      h('b', {}, `${dest.name} · 촬영`)), body);

  const timeline = () => {
    const rows = [...plan.placements].sort((a, b) => a.day - b.day || a.slot - b.slot).map((p) => {
      const c = findCard(dest, p.cardId);
      return h('li', { class: `tl kind-${c.kind}`, 'data-id': c.id }, h('span', { class: 'when' }, `Day${p.day} ${SLOT_NAMES[p.slot]}`),
        h('b', {}, c.name), h('span', { class: 'pts' }, `+${c.points * c.slots}점`));
    });
    return h('ol', { class: 'timeline' }, rows);
  };
  const eventLog = (log) => log.length ? h('ul', { class: 'evlog' }, log.map((l) => {
    const e = data.events.find((x) => x.id === l.event);
    return h('li', {}, h('i', {}, e?.text ?? l.event), ' → ', h('b', {}, l.choice));
  })) : null;

  function step() {
    err = '';
    try {
      const r = resolveWithChoices(state, dest, plan, { editDays: 0, style: 'info' }, data, bal, choices);
      if (r.pending) { stage = 'event'; pending = r.pending; last = null; }
      else { last = r; pending = null; stage = r.report.burnout || r.report.cancelled ? 'burnout' : 'edit'; }
    } catch (e) { err = e.message; stage = 'error'; }
    redraw();
  }

  function finish() {
    try {
      const r = resolveWithChoices(state, dest, plan, { editDays, style }, data, bal, choices);
      setState(r.state);
      nav('result', { report: r.report, dest, plan });
    } catch (e) { err = e.message; redraw(); }
  }

  function redraw() {
    clear(body);
    let firstChoice = null;
    if (stage === 'start') {
      append(body, [h('p', {}, '일정대로 촬영을 시작합니다.'), timeline(),
        h('button', { class: 'btn primary start', onclick: step }, '🎬 촬영 시작')]);
    } else if (stage === 'event') {
      const e = pending.event;
      append(body, [timeline(), choices.length ? h('p', { class: 'hint' }, `이벤트 ${choices.length}건 처리됨`) : null,
        h('div', { class: 'popup', role: 'dialog', 'aria-modal': 'true', 'aria-label': '이벤트' },
          h('h4', {}, pending.tag === 'transport' ? '✈ 이동 중' : pending.tag === 'upload' ? '📤 업로드 직전' : '📷 촬영 중'),
          h('p', { class: 'evtext' }, e.text),
          e.choices.map((c, i) => { const b = h('button', { class: 'btn choice', 'data-i': i, onclick: () => { choices.push(i); step(); } },
            c.label, c.effects ? h('small', {}, ` ${fx(c.effects)}`) : null); if (i === 0) firstChoice = b; return b; }))]);
      focusEl(firstChoice);
    } else if (stage === 'burnout') {
      const r = last.report;
      append(body, [timeline(), eventLog(r.log),
        h('p', { class: 'warn' }, r.cancelled ? '지불 중 파산했어요.' : `체력이 바닥나 쓰러졌어요! ${r.restDays}일 강제 휴식, 업로드 불발.`),
        h('button', { class: 'btn primary commit', onclick: () => { setState(last.state); nav('result', { report: r, dest, plan }); } }, '확인')]);
    } else if (stage === 'edit') {
      const qs = qualityByEditDays(state, dest, plan, style, data, bal, choices);
      append(body, [timeline(), eventLog(last.report.log), h('h4', {}, '✂ 편집'),
        h('label', {}, `편집일 ${editDays}일 `, h('input', { type: 'range', class: 'editdays', min: 0, max: bal.edit.maxDays, value: editDays,
          oninput: (e) => { editDays = +e.target.value; redraw(); } })),
        h('p', { class: 'qmeter' }, `예상 품질 ${qs[editDays] != null ? qs[editDays].toFixed(2) : '–'} (편집일별: ${qs.map((q) => q?.toFixed(2)).join(' / ')})`),
        h('div', { class: 'styles' }, STYLES.map(([k, name]) => h('button', { class: `btn style ${style === k ? 'on' : ''}`, 'data-style': k, 'aria-pressed': String(style === k),
          onclick: () => { style = k; redraw(); } }, name))),
        err ? h('p', { class: 'warn' }, err) : null,
        h('button', { class: 'btn primary upload', onclick: finish }, '📤 업로드')]);
    } else {
      append(body, [h('p', { class: 'warn' }, err)]);
    }
  }
  redraw();
  return section;
}

function fx(e) {
  const parts = [];
  if (e.stamina) parts.push(`체력 ${e.stamina > 0 ? '+' : ''}${e.stamina}`);
  if (e.cost) parts.push(`비용 ${won(e.cost)}`);
  if (e.days) parts.push(`${e.days}일 지연`);
  if (e.rep) parts.push(`평판 ${e.rep > 0 ? '+' : ''}${e.rep}`);
  return parts.length ? `(${parts.join(', ')})` : '';
}
