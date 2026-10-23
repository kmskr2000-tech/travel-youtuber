// 시뮬 회귀: 고정 시드 시뮬 출력 스냅샷 + 밸런스 밴드. 의도적 밸런스 변경 시 UPDATE_GOLDEN=1 npm test 로 갱신.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const run = () => {
  const r = spawnSync(process.execPath, ['tools/sim.mjs', '--n', '40', '--max', '150', '--data'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const GOLD = new URL('./golden/sim-n40.txt', import.meta.url);
const out = run();

test('시뮬: 같은 시드 → 출력 완전 동일 (결정성)', () => assert.equal(run(), out));

test('시뮬: 골든 스냅샷 일치', () => {
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLD)) writeFileSync(GOLD, out);
  assert.equal(out, readFileSync(GOLD, 'utf8'), '밸런스/엔진 변경으로 시뮬 결과가 바뀜. 의도한 변경이면 UPDATE_GOLDEN=1');
});

test('시뮬: 밸런스 밴드 (신중 정책 달성률·소요 기간)', () => {
  const m = out.match(/\[prudent\] 결과: (\{.*\})/);
  const res = JSON.parse(m[1]);
  const total = Object.values(res).reduce((a, b) => a + b, 0);
  const winRate = (res.win ?? 0) / total;
  assert.ok(winRate >= 0.6 && winRate <= 0.97, `달성률 ${winRate}`);
  const years = +out.match(/100만 도달 \d+\/\d+: 편수 p50=\d+ 일수 p50=\d+ \(([\d.]+)년\)/)[1];
  assert.ok(years >= 0.5 && years <= 2.5, `100만 도달 ${years}년`);
  const m10k = +out.match(/1만 도달 \d+\/\d+: 편수 p50=\d+ 일수 p50=\d+ \(([\d.]+)년\)/)[1];
  assert.ok(m10k > 0.05 && m10k < years, '1만 도달이 100만보다 빠름');
});

test('시뮬: 무모한 정책은 실패 (win 없음)', () => {
  const m = out.match(/\[reckless\] 결과: (\{.*\})/);
  if (!m) return;
  assert.equal(JSON.parse(m[1]).win ?? 0, 0);
});
