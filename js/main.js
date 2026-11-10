// Point d'entrée : navigation, routes, démarrage.
import { S } from './store.js';
import { loadLang, t } from './i18n.js';
import { $, esc, flags, toast } from './ui.js';
import { unlockAudio } from './voice.js';
import { welcome, home, learn, profile, parent } from './views/home.js';
import { map, lesson, quiz } from './views/study.js';
import { camera, call, teachers } from './views/tools.js';
import { academy } from './views/academy.js';
import { settings } from './views/settings.js';

const routes = { welcome, home, learn, profile, parent, map, lesson, quiz, camera, call, teachers, academy, settings };
const NAV = [['home', '🏠', 'nav.home'], ['learn', '📚', 'nav.learn'], ['camera', '📷', 'nav.camera'], ['call', '🎙️', 'nav.talk'], ['profile', '👤', 'nav.profile']];
const GROUP = { map: 'learn', lesson: 'learn', quiz: 'learn', academy: 'learn', teachers: 'profile', parent: 'profile', settings: 'profile' };

const navHtml = (active) => `<nav class="nav" aria-label="${esc(t('nav.label'))}">${NAV.map(([id, ic, key]) => (id === 'camera'
  ? `<a class="cam" href="#/camera" aria-label="${esc(t(key))}"><span class="fab">${ic}</span></a>`
  : `<a href="#/${id}" class="${(GROUP[active] || active) === id ? 'on' : ''}"><span class="ic">${ic}</span>${esc(t(key))}</a>`)).join('')}</nav>`;

let active = null, seq = 0;
async function route() {
  const hash = location.hash.replace(/^#\/?/, '') || (S.onboarded ? 'home' : 'welcome');
  const [path, qs] = hash.split('?');
  const [name, ...args] = path.split('/');
  if (!S.onboarded && name !== 'welcome') { location.replace('#/welcome'); return; }
  const view = routes[name] || routes.home;
  const my = ++seq;
  try { active?.destroy?.(); } catch { /* ignoré */ }
  active = view;
  const full = !!view.fullscreen, bare = full || !!view.nonav;
  $('#app').innerHTML = `<main class="screen ${full ? 'full' : ''}" id="screen"></main>${bare ? '' : navHtml(name)}`;
  const root = $('#screen');
  try { await view.render(root, { args, q: new URLSearchParams(qs || '') }); }
  catch (e) {
    console.error(e);
    if (my === seq) root.innerHTML = `<div class="card center gap2"><p>${esc(t('err.crash'))}</p><pre dir="ltr" class="small">${esc(e.message)}</pre><a class="btn block" href="#/home">${esc(t('nav.home'))}</a></div>`;
  }
}

async function boot() {
  flags.sound = S.prefs.sound;
  await loadLang(S.lang);
  // Adresse du serveur gratuit (fichier data/server.json, sans aucune clé d'API).
  try {
    const r = await fetch('data/server.json');
    const cfg = await r.json();
    if (cfg && cfg.proxyUrl) S.ai.proxyUrl = cfg.proxyUrl;
  } catch { /* le réglage déjà saisi est conservé */ }
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('hashchange', route);
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });
  await route();
}
boot();
