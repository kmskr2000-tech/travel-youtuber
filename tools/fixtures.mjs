// 밸런스 시뮬레이션용 가상 여행지(원형). 실제 데이터 아님 — 요금은 대략적 규모 감각용.
const mk = (id, region, priceLevel, popularity, tr, mult, extra = {}) => ({
  id, name: id, region, priceLevel, popularity, tags: ['자연', '먹방'], bestSeason: [4, 5, 9, 10],
  transports: [tr],
  sights: [1, 2, 3].map((i) => ({ id: `${id}-s${i}`, cost: 8000 * mult * i, slots: 1, fatigue: 8 + i, points: 6 + i, tags: ['자연', '뷰'] })),
  activities: [1, 2].map((i) => ({ id: `${id}-a${i}`, cost: 40000 * mult * i, slots: 2, fatigue: 12 + i, points: 7 + i, tags: ['액티비티'] })),
  foods: [1, 2, 3].map((i) => ({ id: `${id}-f${i}`, cost: 20000 * mult * i, slots: 1, fatigue: 3, points: 5 + i, tags: ['먹방', '로컬'] })),
  lodging: { guesthouse: 35000 * mult, business: 70000 * mult, hotel: 160000 * mult },
  rentalDayCost: 70000, events: [], ...extra,
});
const T = (mode, cost, min, fatigue, vb = 0) => ({ mode, costRoundTrip: cost, durationMin: min, fatigue, videoBonus: vb });
export const FIXTURES = [
  mk('dom-ktx', 'domestic', 3, 1.0, T('ktx', 80000, 120, 5), 1.0),
  mk('dom-jeju', 'domestic', 3, 1.3, T('lcc', 130000, 75, 8), 1.1),
  mk('asia-near', 'overseas', 3, 1.3, T('lcc', 350000, 140, 12), 1.0),
  mk('asia-sea', 'overseas', 2, 1.4, T('lcc', 450000, 420, 18), 0.8),
  mk('eu-long', 'overseas', 4, 1.6, T('fsc', 1700000, 780, 28), 1.5),
  mk('am-long', 'overseas', 4, 1.6, T('fsc', 2100000, 840, 30), 1.6),
  mk('oce-long', 'overseas', 4, 1.4, T('fsc', 1500000, 650, 25, 0.1), 1.4),
  mk('afr-long', 'overseas', 2, 1.5, T('fsc', 2300000, 1100, 32), 1.0),
];
