// 라우터: studio → map → transport → stub
import { h, clear } from './util/h.js';
import { newState, save, load } from './state.js';
import { createMetrics } from './ui/metrics.js';
import { studioScreen } from './ui/studio.js';
import { mapScreen } from './ui/map.js';
import { transportScreen } from './ui/transport.js';
import { stubScreen } from './ui/stub.js';

const SCREENS = { studio: studioScreen, map: mapScreen, transport: transportScreen, stub: stubScreen };

export function createApp(root, data, bal, env = {}) {
  let state = (env.persist === false ? null : load(env.storage)) ?? newState(bal, env.seed);
  let route = { name: 'studio', params: {} };
  const metrics = createMetrics(bal);
  const view = h('main', { class: 'view' });
  root.append(metrics.el, view);

  function render() {
    metrics.update(state);
    clear(view);
    view.appendChild(SCREENS[route.name]({ state, bal, data, nav, setState, ...route.params }));
  }
  function nav(name, params = {}) { route = { name, params }; render(); }
  function setState(s) { state = s; if (env.persist !== false) save(state, env.storage); render(); }
  render();
  return { nav, setState, get state() { return state; }, get route() { return route; }, render };
}
