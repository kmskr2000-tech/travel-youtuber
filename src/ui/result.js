// §4.7 유튜브 스타일 결과 화면
import { h } from '../util/h.js?v=1792737762';
import { won, views as vfmt, num, signed } from '../util/format.js?v=1792737762';
import { lineChart } from '../util/chart.js?v=1792737762';
import { rollNumber, prefersReducedMotion } from '../util/fx.js?v=1792737762';

const STYLE_NAME = { info: '정보형', emotion: '감성형', bait: '자극형' };

export function resultScreen({ state, bal, data, dest, report, nav }) {
  const r = report;
  const last = state.videos[state.videos.length - 1];
  const subsNow = state.subs;
  const series = state.videos.slice(-20).map((v, i, a) => subsNow - a.slice(i + 1).reduce((s, x) => s + x.subGain, 0));
  const ended = state.ended ?? state.over;
  const back = h('button', { class: 'btn primary home', onclick: () => nav('studio') }, '스튜디오로');
  if (r.burnout || r.cancelled || !last) {
    return h('section', { class: 'screen result-screen' }, h('h3', { tabindex: -1 }, r.cancelled ? '💸 파산' : '😵 번아웃'),
      h('p', {}, r.cancelled ? '비용을 감당하지 못했어요.' : '업로드 없이 휴식 후 복귀합니다.'), banner(ended), back);
  }
  const vEl = h('span', { class: 'views' }, `👁 ${num(0)}`), gEl = h('span', { class: 'subgain' }, `👥 ${signed(0)}`), aEl = h('span', { class: 'ad' }, `💰 ${won(0)}`);
  rollNumber(vEl, 0, r.views, (v) => `👁 ${num(v)}`, 1400);
  rollNumber(gEl, 0, r.subGain, (v) => `👥 ${signed(Math.round(v))}`, 1400);
  rollNumber(aEl, 0, r.ad, (v) => `💰 ${won(v)}`, 1400);
  const fx = r.viral && !prefersReducedMotion() ? h('div', { class: 'burst', 'aria-hidden': 'true' }, Array.from({ length: 14 }, (_, i) => h('i', { style: { '--a': `${i * 25.7}deg`, '--d': `${60 + (i % 4) * 14}px` } }))) : null;
  const title = `${dest.name} ${r.ev.totalDays}일 여행 브이로그`;
  const row = (k, v) => [h('dt', {}, k), h('dd', {}, v)];
  return h('section', { class: `screen result-screen ${r.viral ? 'is-viral' : ''}` },
    h('div', { class: 'yt' },
      h('div', { class: 'player', 'aria-hidden': 'true' }, '▶', r.viral ? h('span', { class: 'viral' }, '🔥 떡상') : null, fx),
      h('h3', { class: 'ytitle', tabindex: -1 }, title),
      h('p', { class: 'ymeta' }, `조회수 ${vfmt(r.views)} · ${STYLE_NAME[last.style] ?? last.style}${r.firstVisit ? ' · 첫 방문' : ''}`),
      h('div', { class: 'ystats', role: 'group', 'aria-label': `조회수 ${num(r.views)}, 구독자 ${signed(r.subGain)}, 수익 ${won(r.ad)}` }, vEl, gEl, aEl)),
    h('dl', { class: 'breakdown' },
      row('품질 Q', r.Q.toFixed(2)), row('콘텐츠 C', r.C.toFixed(2)), row('편집 E', r.E.toFixed(2)),
      row('트렌드 ×', r.T.toFixed(2)), row('신선도 ×', r.N.toFixed(2)),
      row('소요일', `${r.daysPassed}일`)),
    r.sponsorNote === 'fulfilled' ? h('p', { class: 'alert' }, '🤝 협찬 조건 이행! 평판 +2') : null,
    r.sponsorNote === 'penalty' ? h('p', { class: 'warn' }, '🤝 협찬 기한 초과 — 위약금과 평판 하락') : null,
    r.log.length ? h('ul', { class: 'evlog' }, r.log.map((l) => h('li', {}, `${data.events.find((e) => e.id === l.event)?.text ?? l.event} → ${l.choice}`))) : null,
    h('div', { class: 'panel' }, h('h4', {}, '구독자 추이'), lineChart(series, { label: '구독자 추이' })),
    banner(ended), back);
}

function banner(ended) {
  if (!ended) return null;
  return h('p', { class: ended.type === 'win' ? 'alert win' : 'warn gameover' },
    ended.type === 'win' ? '🏆 구독자 100만 달성!' : '💀 게임 오버 (파산)');
}
