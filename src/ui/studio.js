// §4.2 스튜디오(홈)
import { h } from '../util/h.js';
import { won, views, compact } from '../util/format.js';
import { lineChart, barChart } from '../util/chart.js';
import { rest, trainSkill } from '../engine/game.js';
import { loanLimit, availableCredit } from '../engine/economy.js';

export function studioScreen({ state, bal, nav, setState }) {
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
      h('button', { class: 'btn train-edit', onclick: act((s) => trainSkill(s, 'edit', bal)) }, `✂ 편집 훈련 ${won(trainCost(state.editLv))}`),
      h('button', { class: 'btn loan', disabled: true, title: 'M5에서 열립니다' }, `💳 대출/상환 (한도 ${compact(loanLimit(state, bal))}원, 가용 ${compact(availableCredit(state, bal))}원)`)),
    msg,
    state.sponsorPending ? h('p', { class: 'alert' }, `🤝 협찬 진행 중: ${state.sponsorPending.tag}`) : null,
    h('div', { class: 'recent' }, h('h4', {}, '최근 영상'), cards.length ? h('div', { class: 'vlist' }, cards) : h('p', { class: 'empty' }, '아직 영상이 없어요. 첫 여행을 떠나보세요!')));
}
