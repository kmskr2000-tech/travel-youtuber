// 대출/상환 패널 (스튜디오 내)
import { h } from '../util/h.js';
import { won, compact } from '../util/format.js';
import { borrow, repay, loanLimit, availableCredit } from '../engine/economy.js';

export function loanPanel({ state, bal, setState }) {
  const msg = h('p', { class: 'msg', role: 'alert' });
  const input = h('input', { type: 'number', class: 'loan-amt', min: 0, step: 10000, inputmode: 'numeric', id: 'loan-amt', placeholder: '금액(원)' });
  const amt = () => Math.floor(+input.value || 0);
  const act = (fn) => () => { try { setState(fn(state, amt())); } catch (e) { msg.textContent = e.message; } };
  const credit = availableCredit(state, bal);
  return h('div', { class: 'panel loan-panel', role: 'group', 'aria-label': '대출과 상환' },
    h('h4', {}, '💳 대출 / 상환'),
    h('p', { class: 'loan-info' }, `대출 잔액 ${won(state.loan)} · 한도 ${compact(loanLimit(state, bal))}원 · 가용 ${compact(credit)}원 · 월 이자 ${Math.round(bal.loan.monthlyRate * 100)}%`),
    h('label', { for: 'loan-amt' }, '금액 ', input),
    h('div', { class: 'loan-btns' },
      h('button', { class: 'btn borrow', disabled: credit <= 0, onclick: act((s, a) => borrow(s, a, bal)) }, '빌리기'),
      h('button', { class: 'btn repay', disabled: state.loan <= 0 || state.cash <= 0, onclick: act((s, a) => repay(s, a)) }, '상환'),
      h('button', { class: 'btn repay-all', disabled: state.loan <= 0 || state.cash <= 0, onclick: () => { try { setState(repay(state, state.loan)); } catch (e) { msg.textContent = e.message; } } }, '가능한 만큼 전액 상환')),
    state.loan > 0 && state.loan > loanLimit(state, bal) * 0.8 ? h('p', { class: 'warn' }, '⚠ 한도의 80% 이상입니다. 한도를 넘으면 파산합니다.') : null,
    msg);
}
