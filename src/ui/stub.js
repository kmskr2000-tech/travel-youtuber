// M3 스텁 결과: 선택 요약 + previewTrip 수치 (상태 변경 없음). 플래너는 M4.
import { h } from '../util/h.js';
import { won, num } from '../util/format.js';
import { previewTrip } from '../engine/game.js';
import { approx } from './transport.js';

export function defaultPlan(dest, transport) {
  return { days: dest.recommendedDays?.[0] ?? 3, transport: transport.mode, rental: false, lodging: 'guesthouse', placements: [] };
}

export function stubScreen({ state, bal, dest, transport, nav }) {
  const plan = defaultPlan(dest, transport);
  const pv = previewTrip(state, dest, plan, bal);
  const row = (k, v) => [h('dt', {}, k), h('dd', {}, v)];
  return h('section', { class: 'screen stub-screen' },
    h('div', { class: 'bar' }, h('button', { class: 'btn back', onclick: () => nav('transport', { dest }) }, '← 이동수단'), h('b', {}, '선택 요약 (임시)')),
    h('div', { class: 'card' },
      h('h3', {}, `${dest.name} · ${transport.name}`),
      h('dl', {},
        row('기본 일정', `${plan.days}박 (숙소: 게스트하우스, 일정 카드 없음)`),
        row('예상 총비용', pv.cost ? approx(transport, won(pv.cost.total)) : '–'),
        row('총 소요일', pv.ok ? `${pv.totalDays ?? plan.days}일` : '–'),
        row('여행 후 체력', pv.staminaAfter != null ? `${Math.round(pv.staminaAfter)}` : '–'),
        row('예산', pv.affordable ? '가능' : '부족')),
      pv.ok ? null : h('p', { class: 'warn' }, `일정 점검: ${(pv.errors ?? []).join(', ')}`),
      h('p', { class: 'hint' }, '일정 짜기·촬영·정산은 다음 단계(M4~M5)에서 열립니다.'),
      h('button', { class: 'btn', onclick: () => nav('studio') }, '스튜디오로 돌아가기')));
}
