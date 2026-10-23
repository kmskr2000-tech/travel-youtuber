// §4.3 세계지도 여행지 선택
import { h, clear } from '../util/h.js';
import { project, filterDests, pinRadius, isTrending, allTags, clampView, zoomView, toViewBox, KOREA_VIEW, WORLD_VIEW } from '../util/mapmath.js';
import { monthOf } from '../engine/economy.js';

const dots = (n) => '●'.repeat(n) + '○'.repeat(5 - n);

export function mapScreen({ state, data, nav }) {
  const month = monthOf(state.day);
  const f = { tab: 'domestic', q: '', tag: '', price: '', season: false };
  let view = { ...KOREA_VIEW }, sel = null;
  const svg = h('svg', { class: 'map', viewBox: toViewBox(view), preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': '세계지도' });
  const land = h('g', { class: 'land' }, data.world.countries.map((c) => h('path', { d: c.d, class: `country ${c.id === 'KOR' ? 'kor' : ''}` })));
  const pinsG = h('g', { class: 'pins' });
  svg.append(land, pinsG);
  const info = h('aside', { class: 'infocard', hidden: true });
  const count = h('span', { class: 'count' });

  function setView(v) { view = clampView(v); svg.setAttribute('viewBox', toViewBox(view)); drawPins(); }
  function drawPins() {
    clear(pinsG);
    const k = view.w / 360 * 4 + 0.35; // 줌에 비례한 핀 크기
    const list = filterDests(data.destinations, f, month);
    count.textContent = `${list.length}곳`;
    for (const d of list) {
      const { x, y } = project(d.coord);
      const hot = d.bestSeason.includes(month), trend = isTrending(d, data.trends, month);
      const g = h('g', { class: `pin ${hot ? 'season' : ''} ${sel?.id === d.id ? 'sel' : ''}`, tabindex: 0, 'data-id': d.id,
        onclick: () => select(d), onkeydown: (e) => { if (e.key === 'Enter') select(d); } },
        h('circle', { cx: x, cy: y, r: pinRadius(d, k) }),
        trend ? h('text', { x: x + pinRadius(d, k), y: y - pinRadius(d, k), class: 'fire', 'font-size': 3 * k }, '🔥') : null,
        h('title', {}, d.name));
      pinsG.appendChild(g);
    }
  }
  function select(d) {
    sel = d; info.hidden = false; clear(info);
    info.append(
      h('h3', {}, d.name, trendBadge(d)),
      h('p', { class: 'price' }, `물가 ${dots(d.priceLevel)}`),
      h('p', {}, `추천 시기 ${d.bestSeason.map((m) => m + '월').join(' ')}`, d.bestSeason.includes(month) ? h('b', { class: 'tag-now' }, ' · 지금이 제철') : null),
      h('p', { class: 'tags' }, d.tags.map((t) => `#${t}`).join(' ')),
      h('button', { class: 'btn primary select', onclick: () => nav('transport', { dest: d }) }, '선택'));
    drawPins();
  }
  const trendBadge = (d) => (isTrending(d, data.trends, month) ? h('span', { class: 'trend' }, ' 🔥 트렌드') : null);

  // 팬/줌
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, v: { ...view } }; });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect?.() ?? { width: 360 };
    const sc = view.w / (r.width || 360);
    setView({ ...view, x: drag.v.x - (e.clientX - drag.x) * sc, y: drag.v.y - (e.clientY - drag.y) * sc });
  });
  const end = () => { drag = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointerleave', end);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault?.();
    setView(zoomView(view, e.deltaY > 0 ? 1.25 : 0.8, view.x + view.w / 2, view.y + view.h / 2));
  }, { passive: false });

  const tabBtn = (id, label) => h('button', { class: `tab ${f.tab === id ? 'on' : ''}`, 'data-tab': id, onclick: () => {
    f.tab = id; sel = null; info.hidden = true; setView(id === 'domestic' ? KOREA_VIEW : WORLD_VIEW); tabs.replaceChildren(...mk());
  } }, label);
  const mk = () => [tabBtn('domestic', '국내'), tabBtn('overseas', '해외')];
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, ...mk());

  const q = h('input', { type: 'search', placeholder: '여행지 검색', class: 'search', oninput: (e) => { f.q = e.target.value; drawPins(); } });
  const tagSel = h('select', { class: 'flt-tag', onchange: (e) => { f.tag = e.target.value; drawPins(); } },
    h('option', { value: '' }, '태그 전체'), allTags(data.destinations).map((t) => h('option', { value: t }, t)));
  const priceSel = h('select', { class: 'flt-price', onchange: (e) => { f.price = e.target.value; drawPins(); } },
    h('option', { value: '' }, '물가 전체'), [1, 2, 3, 4, 5].map((n) => h('option', { value: n }, `물가 ${n}`)));
  const season = h('label', { class: 'flt-season' }, h('input', { type: 'checkbox', onchange: (e) => { f.season = e.target.checked; drawPins(); } }), ` ${month}월 제철만`);

  drawPins();
  return h('section', { class: 'screen map-screen' },
    h('div', { class: 'bar' }, h('button', { class: 'btn back', onclick: () => nav('studio') }, '← 스튜디오'), tabs, count),
    h('div', { class: 'filters' }, q, tagSel, priceSel, season),
    h('div', { class: 'mapwrap' }, svg, info));
}
