// §4.2 스튜디오(홈)
import { h, clear } from '../util/h.js';
import { won, views, compact } from '../util/format.js';
import { lineChart, barChart } from '../util/chart.js';
import { rest, trainSkill } from '../engine/game.js';
import { loanPanel } from './loan.js';

export function studioScreen({ state, bal, nav, setState, newGame, saveOk }) {
  let confirmNew = false;
  const resetBox = h('div', { class: 'resetbox' });
  const drawReset = () => {
    clear(resetBox);
    resetBox.appendChild(confirmNew
      ? h('span', {}, '정말 처음부터 시작할까요? 저장이 지워져요. ', h('button', { class: 'btn danger confirm-new', onclick: () => newGame() }, '네, 새로 시작'), h('button', { class: 'btn cancel-new', onclick: () => { confirmNew = false; drawReset(); } }, '취소'))
      : h('button', { class: 'btn new-game-btn', onclick: () => { confirmNew = true; drawReset(); } }, '🔄 새 게임'));
  };
  drawReset();
  const recent = state.videos.slice(-20);
  const trend = lineChart(recent.map((v, i) => state.subs - recent.slice(i + 1).reduce((a, x) => a + x.subGain, 0)), { label: '구독자 추이' });
  const st = state.stats;
  const money = barChart([
    { label: '누적 수익', value: st.revenue, text: compact(st.revenue), cls: 'plus' },
    { label: '누적 지출', value: st.spent, text: compact(st.spent), cls: 'minus' },
  ]);
  const msg = h('p', { class: 'msg', role: 'status' });
  const act = (fn) => () => { try { setState(fn(state)); msg.textContent = ''; } catch (e) { msg.textContent = e.message; } };
  const trainCost = (lv) => bal.skill.trainCostPerLevel * lv;
  const cards = state.videos.slice(-3).reverse().map((v) =>
    h('article', { class: 'vcard' }, h('div', { class: 'thumb', 'aria-hidden': 'true' }, '🎞'),
      h('b', {}, v.dest), h('span', {}, `조회 ${views(v.views)}`), h('span', {}, `수익 ${won(v.ad ?? 0)}`)));
  return h('section', { class: 'screen studio-screen' },
    h('div', { class: 'charts' }, h('div', { class: 'panel' }, h('h4', {}, '구독자 추이 (최근 20편)'), trend),
      h('div', { class: 'panel' }, h('h4', {}, '수익/지출'), money)),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary go', onclick: () => nav('map') }, '✈ 새 여행 떠나기'),
      h('button', { class: 'btn rest', onclick: act((s) => rest(s, 1, bal)) }, '🛏 휴식 (+체력)'),
      h('button', { class: 'btn train-shoot', onclick: act((s) => trainSkill(s, 'shoot', bal)) }, `📷 촬영 훈련 ${won(trainCost(state.shootLv))}`),
      h('button', { class: 'btn train-edit', onclick: act((s) => trainSkill(s, 'edit', bal)) }, `✂ 편집 훈련 ${won(trainCost(state.editLv))}`)),
    msg,
    loanPanel({ state, bal, setState }),
    saveOk === false ? h('p', { class: 'warn', role: 'alert' }, '⚠ 저장에 실패했어요. 브라우저 저장소가 막혀 있으면 진행이 사라질 수 있어요.') : null,
    state.sponsorPending ? h('p', { class: 'alert' }, `🤝 협찬 진행 중: ${state.sponsorPending.tag}`) : null,
    resetBox,
    h('div', { class: 'recent' }, h('h4', {}, '최근 영상'), cards.length ? h('div', { class: 'vlist' }, cards) : h('p', { class: 'empty' }, '아직 영상이 없어요. 첫 여행을 떠나보세요!')));
}
