// 시드 가능한 난수 (mulberry32). state 숫자만 저장하면 재현 가능.
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const rng = {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    chance(p) { return rng.next() < p; },
    int(min, max) { return min + Math.floor(rng.next() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    get state() { return s; },
  };
  return rng;
}
