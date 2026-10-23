// GameState 생성 / 저장 / 로드
export const SAVE_KEY = 'travel-youtuber:save:v1';
export const SCHEMA_VERSION = 1;

export function newState(bal, seed = Date.now() % 2 ** 31) {
  const s = bal.start;
  return {
    schemaVersion: SCHEMA_VERSION,
    day: 1, subs: s.subs, views: 0, cash: s.cash, loan: 0,
    stamina: s.stamina, reputation: s.reputation,
    shootLv: s.shootLv, editLv: s.editLv, shootXp: 0, editXp: 0,
    lastUploadDay: 1, rngState: seed >>> 0,
    burnouts: 0, lowStreak: 0, reachMult: 1,
    videos: [], visited: [], sponsorPending: null, over: null, ended: null,
    stats: { revenue: 0, spent: 0, interest: 0, uploads: 0 },
  };
}

export function save(s, storage = globalThis.localStorage) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s?.schemaVersion === SCHEMA_VERSION ? s : null;
  } catch { return null; }
}
