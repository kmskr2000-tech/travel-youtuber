// 대출·이자·일수 경과·공백 감소 (순수 함수: 새 state 반환)
export const loanLimit = (s, bal) => bal.loan.base + s.subs * bal.loan.perSub;
export const availableCredit = (s, bal) => Math.max(0, loanLimit(s, bal) - s.loan);
export const canAfford = (s, amount, bal) => s.cash + availableCredit(s, bal) >= amount;

/** 비용 지불. 잔액 부족분은 자동 대출. 한도 초과면 파산 게임오버 */
export function pay(s, amount, bal) {
  let cash = s.cash - amount;
  let loan = s.loan;
  if (cash < 0) { loan += -cash; cash = 0; }
  const next = { ...s, cash, loan };
  if (loan > loanLimit(next, bal)) next.over = { type: 'bankrupt', day: s.day };
  return next;
}

export const earn = (s, amount) => ({ ...s, cash: s.cash + amount, stats: { ...s.stats, revenue: s.stats.revenue + Math.max(0, amount) } });

export function repay(s, amount) {
  const a = Math.min(amount, s.cash, s.loan);
  return { ...s, cash: s.cash - a, loan: s.loan - a };
}

/** 날짜 경과: 30일 경계마다 이자(월 2%), 마지막 업로드 후 30일 초과 시 주간 구독자 -1% */
export function advanceDays(s, days, bal) {
  let n = { ...s };
  for (let i = 0; i < days; i++) {
    n.day += 1;
    if (n.day % bal.loan.intervalDays === 0 && n.loan > 0) {
      n.loan = Math.round(n.loan * (1 + bal.loan.monthlyRate));
      n.stats = { ...n.stats, interest: n.stats.interest + Math.round(n.loan * bal.loan.monthlyRate / (1 + bal.loan.monthlyRate)) };
    }
    const idle = n.day - n.lastUploadDay;
    if (idle > bal.lapse.afterDays && (idle - bal.lapse.afterDays) % 7 === 0) {
      n.subs = Math.max(0, Math.round(n.subs * (1 - bal.lapse.weeklyLoss)));
    }
  }
  if (n.loan > loanLimit(n, bal) && !n.over) n.over = { type: 'bankrupt', day: n.day };
  return n;
}

export const monthOf = (day) => Math.floor(((day - 1) % 365) / 30.4167) % 12 + 1;
