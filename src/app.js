// 라우터: studio → map → transport → planner → shoot → result
import { h, clear } from './util/h.js?v=1792737762';
import { newState, save, load, clearSave } from './state.js?v=1792737762';
import { createMetrics } from './ui/metrics.js?v=1792737762';
import { studioScreen } from './ui/studio.js?v=1792737762';
import { mapScreen } from './ui/map.js?v=1792737762';
import { transportScreen } from './ui/transport.js?v=1792737762';
import { plannerScreen } from './ui/planner.js?v=1792737762';
import { shootScreen } from './ui/shoot.js?v=1792737762';
import { resultScreen } from './ui/result.js?v=1792737762';
import { endingScreen } from './ui/ending.js?v=1792737762';
import { focusEl } from './util/fx.js?v=1792737762';

const SCREENS = { studio: studioScreen, map: mapScreen, transport: transportScreen, planner: plannerScreen, shoot: shootScreen, result: resultScreen, ending: endingScreen };

export function createApp(root, data, bal, env = {}) {
  let state = (env.persist === false ? null : load(env.storage)) ?? newState(bal, env.seed);
  let route = { name: 'studio', params: {} };
  const metrics = createMetrics(bal);
  const view = h('main', { class: 'view' });
  root.append(metrics.el, view);

  let saveOk = true;
  const persist = () => { if (env.persist !== false) saveOk = save(state, env.storage); };
  function render() {
    // 종료 상태면 결과 화면을 한 번 보여 준 뒤(result) 스튜디오 진입 시 엔딩으로 전환
    const finished = state.over || state.ended;
    if (finished && (route.name === 'studio' || route.name === 'map' || route.name === 'transport' || route.name === 'planner')) {
      route = { name: 'ending', params: {} };
    }
    metrics.update(state);
    clear(view);
    view.appendChild(SCREENS[route.name]({ state, bal, data, nav, setState, newGame, saveOk, ...route.params }));
    globalThis.scrollTo?.(0, 0);
    focusEl(view.querySelector?.('[tabindex="-1"]'));
  }
  function nav(name, params = {}) { route = { name, params }; render(); }
  function setState(s) { state = s; persist(); render(); }
  function newGame() {
    if (env.persist !== false) clearSave(env.storage);
    state = newState(bal, env.seed ?? Date.now() % 2 ** 31);
    persist();
    route = { name: 'studio', params: {} };
    render();
  }
  render();
  return { nav, setState, newGame, get state() { return state; }, get route() { return route; }, get saveOk() { return saveOk; }, render };
}
