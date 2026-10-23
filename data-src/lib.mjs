// 여행지 데이터 작성 보조(DSL → destinations.json). 수치는 한국 출발 기준 원화(KRW).
// 규칙: 장소명은 실제 명칭만. 검증 못 한 값은 estimated:true (기본). v:1 을 주면 공식 출처 확인된 값.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const BASE_LODGING = { guesthouse: 40000, business: 80000, hotel: 180000 }; // 물가계수 적용 전(priceLevel 3 기준)
export const ASOF = '2026-10';

const tagsOf = (s, dflt) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : dflt);

/** 이동수단 [mode, name, 왕복요금, 편도분, opts?{vb,fat,v,src}] */
const mkTr = ([mode, name, cost, min, o = {}]) => ({
  mode, name, costRoundTrip: cost, durationMin: min,
  fatigue: o.fat ?? clamp(Math.round(4 + (min / 60) * 1.6), 5, 22),
  videoBonus: o.vb ?? 0,
  estimated: !o.v, sourceNote: o.src ?? (o.v ? '공식 출처 확인' : `일반 시세 기반 추정(${ASOF}, 공식 확인 전)`),
});
/** 명소 [이름, 입장료, 점수, 태그?, opts?] / 액티비티 [이름, 비용, 점수, 태그?, opts?] / 먹거리 [이름, 비용, 점수, 태그?, opts?] */
const mkCard = (kind, id, [name, cost, points, tags, o = {}], dTags) => ({
  id, name, cost, slots: o.slots ?? (kind === 'a' ? 2 : 1), points,
  fatigue: o.fat ?? (kind === 's' ? 2 + points : kind === 'a' ? 5 + points : 3),
  tags: tagsOf(tags, kind === 'f' ? ['먹방', '로컬'] : dTags),
  estimated: !o.v, ...(o.src ? { sourceNote: o.src } : {}),
});

export function D(d) {
  const o = {
    id: d.id, name: d.name, region: d.country === 'KR' ? 'domestic' : 'overseas', country: d.country,
    continent: d.continent, subregion: d.sub, coord: { lat: d.lat, lon: d.lon }, wave: d.wave,
    priceLevel: d.pl, popularity: d.pop, bestSeason: d.season, tags: d.tags, recommendedDays: d.days,
    transports: d.tr.map(mkTr),
    sights: d.s.map((x, i) => mkCard('s', `${d.id}-s${i + 1}`, x, d.tags)),
    activities: d.a.map((x, i) => mkCard('a', `${d.id}-a${i + 1}`, x, d.tags)),
    foods: d.f.map((x, i) => mkCard('f', `${d.id}-f${i + 1}`, x, d.tags)),
    lodging: d.lodging ?? BASE_LODGING,
    events: d.ev ?? [],
    sourceNote: { basis: d.src ?? `작성자 지식 기반 초안(${ASOF}). 요금·입장료 공식 확인 전 → estimated`, asOf: ASOF },
  };
  if (d.rental) o.rentalDayCost = d.rental;
  return o;
}
