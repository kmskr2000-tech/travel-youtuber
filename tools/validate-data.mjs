// 데이터 검증: node tools/validate-data.mjs  (오류 있으면 exit 1)
import { readFileSync } from 'node:fs';
const rd = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const dests = rd('../data/destinations.json'), events = rd('../data/events.json'), trends = rd('../data/trends.json'), bal = rd('../data/balance.json');
const errs = [], warns = [];
const E = (id, m) => errs.push(`[${id}] ${m}`), W = (id, m) => warns.push(`[${id}] ${m}`);
const CONT = ['asia', 'europe', 'africa', 'north_america', 'south_america', 'oceania'];
const MODES = ['lcc', 'fsc', 'ktx', 'bus', 'cruise', 'ferry', 'rental'];
const evIds = new Set(events.map((e) => e.id));
const ids = new Set(), cardIds = new Set();
const num = (v) => typeof v === 'number' && Number.isFinite(v);
let est = 0, total = 0;

for (const d of dests) {
  const id = d.id ?? '(no id)';
  if (!/^[a-z0-9-]+$/.test(id)) E(id, 'id는 영문 소문자/숫자/하이픈');
  if (ids.has(id)) E(id, 'id 중복'); ids.add(id);
  if (!d.name) E(id, 'name 없음');
  if (!['domestic', 'overseas'].includes(d.region)) E(id, 'region 오류');
  if ((d.country === 'KR') !== (d.region === 'domestic')) E(id, 'region/country 불일치');
  if (!CONT.includes(d.continent)) E(id, 'continent 오류');
  if (!(d.coord && d.coord.lat >= -90 && d.coord.lat <= 90 && d.coord.lon >= -180 && d.coord.lon <= 180)) E(id, 'coord 오류');
  if (![1, 2].includes(d.wave)) E(id, 'wave는 1|2');
  if (!(Number.isInteger(d.priceLevel) && d.priceLevel >= 1 && d.priceLevel <= 5)) E(id, 'priceLevel 1~5');
  if (!(d.popularity >= bal.popularity.min && d.popularity <= bal.popularity.max)) E(id, `popularity 범위 밖 ${d.popularity}`);
  if (d.region === 'domestic' && d.popularity > 1.5) W(id, `국내 popularity 높음 ${d.popularity}`);
  if (d.region === 'overseas' && d.popularity < 1.5) W(id, `해외 popularity 낮음 ${d.popularity}`);
  if (!Array.isArray(d.bestSeason) || !d.bestSeason.length || d.bestSeason.some((m) => !(m >= 1 && m <= 12))) E(id, 'bestSeason 1~12');
  if (!Array.isArray(d.tags) || !d.tags.length) E(id, 'tags 없음');
  if (!(Array.isArray(d.recommendedDays) && d.recommendedDays.length === 2 && d.recommendedDays[0] <= d.recommendedDays[1])) E(id, 'recommendedDays [min,max]');
  const cnt = [['sights', 3, 5], ['activities', 2, 3], ['foods', 2, 3]];
  for (const [k, lo, hi] of cnt) if (!(d[k]?.length >= lo && d[k].length <= hi)) E(id, `${k} ${lo}~${hi}개 필요 (현재 ${d[k]?.length ?? 0})`);
  if (!d.transports?.length) E(id, 'transports 없음');
  for (const t of d.transports ?? []) {
    if (!MODES.includes(t.mode)) E(id, `mode 오류 ${t.mode}`);
    if (!(num(t.costRoundTrip) && t.costRoundTrip >= 0)) E(id, `${t.mode} 요금 오류`);
    if (!(num(t.durationMin) && t.durationMin > 0 && t.durationMin <= 2400)) E(id, `${t.mode} 소요시간 오류`);
    if (!(num(t.fatigue) && t.fatigue >= 0 && t.fatigue <= (bal.travel.fatigueMax ?? 99))) E(id, `${t.mode} fatigue 오류`);
    if (!(t.videoBonus >= 0 && t.videoBonus <= 0.3)) E(id, `${t.mode} videoBonus 0~0.3`);
    if (t.estimated !== true && !t.sourceNote) E(id, `${t.mode} 확정값에 sourceNote 없음`);
    if (t.estimated && !t.sourceNote) E(id, `${t.mode} 추정값에 sourceNote 필요`);
    total++; if (t.estimated) est++;
    if (d.region === 'overseas' && d.continent !== 'asia' && t.durationMin < 360 && !['cruise', 'ferry'].includes(t.mode) && d.country !== 'GU') W(id, `비아시아 편도 ${t.durationMin}분 짧음`);
  }
  for (const [k] of cnt) for (const c of d[k] ?? []) {
    const cid = `${id}/${c.id}`;
    if (cardIds.has(c.id)) E(id, `카드 id 중복 ${c.id}`); cardIds.add(c.id);
    if (!c.name) E(cid, 'name 없음');
    if (!(num(c.cost) && c.cost >= 0)) E(cid, 'cost 오류');
    if (![1, 2, 3].includes(c.slots)) E(cid, 'slots 1~3');
    if (!(num(c.fatigue) && c.fatigue >= 0 && c.fatigue <= 30)) E(cid, 'fatigue 오류');
    if (!(num(c.points) && c.points >= 1 && c.points <= 10)) E(cid, 'points 1~10');
    if (!c.tags?.length) E(cid, 'tags 없음');
    total++; if (c.estimated) est++;
    if (c.cost > 1000000) W(cid, `비용 매우 높음 ${c.cost}`);
  }
  if (!(d.lodging && ['guesthouse', 'business', 'hotel'].every((k) => num(d.lodging[k]) && d.lodging[k] > 0))) E(id, 'lodging 3종 필요');
  else if (!(d.lodging.guesthouse < d.lodging.business && d.lodging.business < d.lodging.hotel)) E(id, 'lodging 순서 오류');
  for (const e of d.events ?? []) if (!evIds.has(e)) E(id, `없는 이벤트 id ${e}`);
  if (!d.sourceNote?.basis || !d.sourceNote?.asOf) E(id, 'sourceNote.basis/asOf 필요');
}

// ── 이벤트·트렌드 검증 ──
{
  const TRIG = ['slot', 'transport', 'upload'], EFF = ['stamina', 'cost', 'W', 'rep', 'days'];
  const CK = ['months', 'regions', 'continents', 'subregions', 'countries', 'tags', 'modes', 'minSubs', 'maxStamina', 'minDurationMin'];
  const allTags = new Set(dests.flatMap((d) => d.tags)), allSub = new Set(dests.map((d) => d.subregion)), allCty = new Set(dests.map((d) => d.country));
  const seen = new Set();
  const matchDest = (c, d) => (!c.regions || c.regions.includes(d.region)) && (!c.continents || c.continents.includes(d.continent))
    && (!c.subregions || c.subregions.includes(d.subregion)) && (!c.countries || c.countries.includes(d.country)) && (!c.tags || c.tags.some((t) => d.tags.includes(t)));
  for (const e of events) {
    const id = `event:${e.id}`;
    if (!/^[a-z0-9-]+$/.test(e.id ?? '')) E(id, 'id 형식');
    if (seen.has(e.id)) E(id, 'id 중복'); seen.add(e.id);
    if (!TRIG.includes(e.trigger)) E(id, 'trigger 오류');
    if (!(e.weight > 0)) E(id, 'weight > 0');
    if (!e.text) E(id, 'text 없음');
    const c = e.conditions ?? {};
    for (const k of Object.keys(c)) if (!CK.includes(k)) E(id, `알 수 없는 조건 ${k}`);
    if (c.months && c.months.some((m) => !(m >= 1 && m <= 12))) E(id, 'months 1~12');
    if (c.regions && c.regions.some((r) => !['domestic', 'overseas'].includes(r))) E(id, 'regions 오류');
    if (c.continents && c.continents.some((x) => !CONT.includes(x))) E(id, 'continents 오류');
    if (c.subregions && c.subregions.some((x) => !allSub.has(x))) E(id, 'subregions 없음');
    if (c.countries && c.countries.some((x) => !allCty.has(x))) E(id, 'countries 없음');
    if (c.tags && c.tags.some((x) => !allTags.has(x))) E(id, `tags에 없는 태그 ${c.tags.filter((x) => !allTags.has(x))}`);
    if (c.modes && c.modes.some((x) => !MODES.includes(x))) E(id, 'modes 오류');
    if (c.modes && e.trigger !== 'transport') E(id, 'modes는 transport 이벤트 전용');
    if (c.minDurationMin != null && e.trigger !== 'transport') E(id, 'minDurationMin은 transport 이벤트 전용');
    if (!Array.isArray(e.choices) || !e.choices.length) E(id, 'choices 없음');
    for (const ch of e.choices ?? []) {
      if (!ch.label) E(id, 'choice label 없음');
      for (const [k, v] of Object.entries(ch.effects ?? {})) {
        if (!EFF.includes(k)) E(id, `미지원 효과 ${k}`);
        else if (!num(v)) E(id, `효과값 숫자 아님 ${k}`);
      }
      const ef = ch.effects ?? {};
      if (Math.abs(ef.stamina ?? 0) > 15 || (ef.cost ?? 0) > 300000 || (ef.cost ?? 0) < 0 || Math.abs(ef.W ?? 0) > 0.25 || Math.abs(ef.rep ?? 0) > 3 || (ef.days ?? 0) < 0 || (ef.days ?? 0) > 2) W(id, `효과 크기 점검 ${JSON.stringify(ef)}`);
    }
    if (e.trigger !== 'upload' && !dests.some((d) => matchDest(c, d))) W(id, '조건에 맞는 여행지 없음(도달 불가)');
  }
  for (const [i, t] of trends.entries()) {
    const id = `trend:${t.tag ?? i}`;
    if (!allTags.has(t.tag)) E(id, '어떤 여행지에도 없는 태그');
    if (!Array.isArray(t.months) || !t.months.length || t.months.some((m) => !(m >= 1 && m <= 12))) E(id, 'months 1~12');
    if (!(t.multiplier > 1 && t.multiplier <= 1.3)) E(id, 'multiplier 1~1.3');
    if (!t.label) E(id, 'label 없음');
  }
  const byTrig = (x) => events.filter((e) => e.trigger === x).length;
  console.log(`이벤트 ${events.length}종 (slot ${byTrig('slot')} / transport ${byTrig('transport')} / upload ${byTrig('upload')}) | 트렌드 ${trends.length}종`);
}
const byW = (w) => dests.filter((d) => d.wave === w).length;
const byC = {}; dests.forEach((d) => (byC[d.continent] = (byC[d.continent] ?? 0) + 1));
console.log(`여행지 ${dests.length}곳 (1웨이브 ${byW(1)} / 2웨이브 ${byW(2)}) | 국내 ${dests.filter((d) => d.region === 'domestic').length} | 대륙 ${JSON.stringify(byC)}`);
console.log(`항목 ${total}개 중 추정(estimated) ${est}개 = ${(est / Math.max(1, total) * 100).toFixed(0)}%, 공식 확인 ${total - est}개`);
warns.forEach((w) => console.log('WARN', w));
errs.forEach((e) => console.log('ERROR', e));
console.log(errs.length ? `검증 실패: 오류 ${errs.length}건` : `검증 통과 (경고 ${warns.length}건)`);
process.exit(errs.length ? 1 : 0);
