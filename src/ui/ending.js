// 게임오버 / 엔딩 화면
import { h } from '../util/h.js?v=1792737762';
import { won, num, views, compact } from '../util/format.js?v=1792737762';
import { lineChart } from '../util/chart.js?v=1792737762';

export function endingGrade(state, bal) {
  if (state.ended?.type === 'win') return state.ended.day <= 365 ? '전설의 여행 크리에이터' : '월드 클래스 여행 크리에이터';
  const r = state.subs / bal.win.subs;
  return r >= 0.5 ? '아쉬운 도전자' : r >= 0.1 ? '열정의 여행자' : '떠나는 데 의의가 있다';
}

export function endingScreen({ state, bal, newGame }) {
  const win = state.ended?.type === 'win';
  const end = state.ended ?? state.over;
  const st = state.stats;
  const series = state.videos.map((_, i, a) => state.subs - a.slice(i + 1).reduce((s, x) => s + x.subGain, 0));
  const best = state.videos.reduce((m, v) => (v.views > (m?.views ?? -1) ? v : m), null);
  const row = (k, v) => [h('dt', {}, k), h('dd', {}, v)];
  const btn = h('button', { class: 'btn primary new-game', onclick: () => newGame() }, '새 게임 시작');
  const sec = h('section', { class: `screen ending-screen ${win ? 'win' : 'lose'}`, role: 'main', 'aria-labelledby': 'end-title' },
    h('h2', { id: 'end-title', tabindex: -1 }, win ? '🏆 구독자 100만 달성!' : '💀 파산 — 게임 오버'),
    h('p', { class: 'grade' }, endingGrade(state, bal)),
    h('p', {}, win ? `${end.day}일 만에 ${num(bal.win.subs)}명 구독자를 모았어요.` : `${end.day}일째, 대출이 한도를 넘어 채널이 문을 닫았어요.`),
    h('dl', { class: 'endstats' },
      row('플레이 일수', `${end.day}일`), row('최종 구독자', `${num(state.subs)}명`), row('누적 조회수', views(state.views)),
      row('업로드', `${st.uploads}편`), row('누적 수익', won(st.revenue)), row('누적 지출', won(st.spent)),
      row('이자 지출', won(st.interest)), row('남은 대출', won(state.loan)), row('번아웃', `${state.burnouts ?? 0}회`),
      row('방문 여행지', `${state.visited.length}곳`),
      best ? row('최고 조회 영상', `${best.dest} · ${views(best.views)}`) : null),
    h('div', { class: 'panel' }, h('h4', {}, '구독자 추이'), lineChart(series, { label: '구독자 추이' })),
    btn);
  return sec;
}
