import { h } from './h.js?v=1792737762';

/** 구독자 추이 라인 (값 배열) */
export function lineChart(values, { w = 320, h: ht = 120, label = '' } = {}) {
  const svg = h('svg', { viewBox: `0 0 ${w} ${ht}`, class: 'chart', role: 'img', 'aria-label': label });
  if (values.length < 2) {
    svg.appendChild(h('text', { x: w / 2, y: ht / 2, class: 'chart-empty', 'text-anchor': 'middle' }, '영상 2편 이상 업로드하면 그래프가 그려져요'));
    return svg;
  }
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1, pad = 10;
  const pts = values.map((v, i) => `${pad + (i / (values.length - 1)) * (w - pad * 2)},${ht - pad - ((v - lo) / span) * (ht - pad * 2)}`);
  svg.appendChild(h('polyline', { points: pts.join(' '), class: 'chart-line', fill: 'none' }));
  const [lx, ly] = pts[pts.length - 1].split(',');
  svg.appendChild(h('circle', { cx: lx, cy: ly, r: 3.5, class: 'chart-dot' }));
  return svg;
}

/** 가로 막대 [{label, value, cls}] */
export function barChart(items, { w = 320, rowH = 26 } = {}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const svg = h('svg', { viewBox: `0 0 ${w} ${items.length * rowH + 4}`, class: 'chart', role: 'img' });
  items.forEach((it, i) => {
    const y = i * rowH + 2, bw = Math.max(2, (Math.abs(it.value) / max) * (w - 120));
    svg.appendChild(h('text', { x: 0, y: y + 16, class: 'bar-label' }, it.label));
    svg.appendChild(h('rect', { x: 86, y: y + 3, width: bw, height: rowH - 10, rx: 3, class: `bar ${it.cls ?? ''}` }));
    svg.appendChild(h('text', { x: 90 + bw, y: y + 16, class: 'bar-val' }, it.text ?? String(it.value)));
  });
  return svg;
}
