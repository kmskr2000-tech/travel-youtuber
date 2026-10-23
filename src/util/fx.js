// 연출 공통: 동작 줄이기 존중, 숫자 롤링
export function prefersReducedMotion() {
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
export function rollNumber(el, from, to, fmt, ms = 800) {
  if (from === to || typeof requestAnimationFrame !== 'function' || prefersReducedMotion()) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = fmt(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
/** 포커스 이동 (가짜 DOM 호환) */
export const focusEl = (el) => { try { el?.focus?.(); } catch { /* noop */ } };
