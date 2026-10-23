import { createApp } from './app.js';
const j = (p) => fetch(p).then((r) => r.json());
const [bal, destinations, events, trends, world] = await Promise.all(
  ['data/balance.json', 'data/destinations.json', 'data/events.json', 'data/trends.json', 'data/world.json'].map(j));
createApp(document.getElementById('app'), { destinations, events, trends, world }, bal);
