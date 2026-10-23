// 이벤트 선택·적용. 데이터 구동 (data/events.json)
export function eligible(ev, ctx) {
  const c = ev.conditions ?? {};
  if (ev.trigger !== ctx.trigger) return false;
  if (c.months && !c.months.includes(ctx.month)) return false;
  if (c.regions && ctx.dest && !c.regions.includes(ctx.dest.region)) return false;
  if (c.continents && ctx.dest && !c.continents.includes(ctx.dest.continent)) return false;
  if (c.subregions && ctx.dest && !c.subregions.includes(ctx.dest.subregion)) return false;
  if (c.countries && ctx.dest && !c.countries.includes(ctx.dest.country)) return false;
  if (c.tags && ctx.dest && !c.tags.some((t) => ctx.dest.tags.includes(t))) return false;
  if (c.minDurationMin != null && (ctx.durationMin ?? 0) < c.minDurationMin) return false;
  if (c.minSubs && ctx.subs < c.minSubs) return false;
  if (c.maxStamina != null && ctx.stamina > c.maxStamina) return false;
  if (c.modes && ctx.mode && !c.modes.includes(ctx.mode)) return false;
  return true;
}

export function pickEvent(events, ctx, rng) {
  const pool = events.filter((e) => eligible(e, ctx));
  if (!pool.length) return null;
  const boost = (e) => (ctx.dest?.events?.includes(e.id) ? 2 : 1);
  const total = pool.reduce((a, e) => a + e.weight * boost(e), 0);
  let r = rng.next() * total;
  for (const e of pool) { r -= e.weight * boost(e); if (r <= 0) return e; }
  return pool[pool.length - 1];
}

/** 효과를 누적 객체로 환산 (state 직접 변경 안 함) */
export function sumEffects(effects = {}) {
  return {
    stamina: effects.stamina ?? 0,
    cost: effects.cost ?? 0,
    W: effects.W ?? 0,
    rep: effects.rep ?? 0,
    days: effects.days ?? 0,
    subsPct: effects.subsPct ?? 0,
    lostSlot: effects.lostSlot ?? 0,
  };
}
