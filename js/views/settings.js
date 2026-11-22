// Réglages : langue, profil, IA, voix (téléphone / ElevenLabs), installation, données.
import { S, save, resetAll, exportJSON } from '../store.js';
import { t, loadLang } from '../i18n.js';
import { $, esc, toast, modal, flags } from '../ui.js';
import { icon } from '../icons.js';
import { gradeText } from '../curriculum.js';
import { chat, aiReady } from '../ai.js';
import { deviceVoices, speak, stopSpeaking, elevenVoices, elevenSearchHebrew, elevenAddShared, unlockAudio, sttSupported } from '../voice.js';

const go = (h) => { location.hash = h; };
const MODELS = [['claude-haiku-4-5', 'Haiku 4.5'], ['claude-sonnet-4-6', 'Sonnet 4.6'], ['claude-opus-4-6', 'Opus 4.6']];
// Choix exclusif : contrôle segmenté (valeur, libellé déjà échappé).
const seg = (items, cur, attr) => `<div class="seg">${items.map(([v, label]) => `<button class="${String(v) === String(cur) ? 'on' : ''}" data-${attr}="${v}" aria-pressed="${String(v) === String(cur)}">${label}</button>`).join('')}</div>`;
const opts = (list, cur) => list.map(([v, n]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');

function draw(root) {
  const el = S.voice.eleven, mode = S.ai.mode;
  const he = deviceVoices('he');
  root.innerHTML = `
    <div class="top"><button class="icon" id="bk" aria-label="${t('back')}">${icon('back')}</button><h1 class="h1">${t('set.title')}</h1></div>

    <div class="sec" style="margin-top:16px"><h3>${t('set.lang')}</h3>${seg([['he', 'עברית'], ['fr', 'Français']], S.lang, 'lang')}</div>

    <div class="sec"><h3>${t('set.profile')}</h3>
      <div class="field"><label>${t('wel.name')}</label><input class="inp" id="nm" dir="auto" value="${esc(S.name)}"></div>
      <div class="segs">${seg([10, 11, 12].map((g) => [g, gradeText(g)]), S.grade, 'g')}${seg([['school', `${icon('school')}${esc(t('track.school'))}`], ['academy', `${icon('graduation-cap')}${esc(t('track.academy'))}`]], S.track, 'tr')}</div></div>

    <div class="sec"><h3>${t('set.ai')}</h3>
      ${seg([['demo', esc(t('set.ai.demo'))], ['key', esc(t('set.ai.mykey'))], ['proxy', esc(t('set.ai.proxy'))]], mode, 'ai')}
      ${mode === 'key' ? `<div class="field"><label for="aikey">${t('set.ai.key')}</label><input class="inp" id="aikey" type="password" dir="ltr" placeholder="sk-ant-..." value="${esc(S.ai.key)}" autocomplete="off"></div><div class="warn">${icon('info')}<span>${t('set.ai.keynote')}</span></div>` : ''}
      ${mode === 'proxy' ? `<div class="field"><label for="aiurl">${t('set.ai.url')}</label><input class="inp" id="aiurl" dir="ltr" placeholder="https://..." value="${esc(S.ai.proxyUrl)}"></div><div class="${S.ai.proxyUrl ? 'ok' : 'warn'}">${icon(S.ai.proxyUrl ? 'circle-check' : 'info')}<span>${t(S.ai.proxyUrl ? 'set.ai.freeserver' : 'set.ai.noserver')}</span></div>` : ''}
      ${mode === 'demo' ? `<p class="small muted gap">${t('set.ai.demonote')}</p>` : ''}
      <div class="field"><label>${t('set.ai.model')}</label><select class="inp" id="model" dir="ltr">${opts(MODELS, S.ai.model)}</select></div>
      <div class="field"><label>${t('set.ai.vision')}</label><select class="inp" id="vmodel" dir="ltr">${opts(MODELS, S.ai.visionModel)}</select></div>
      <button class="btn secondary block" id="aitest">${t('set.ai.test')}</button><div id="aires" class="gap" dir="auto" aria-live="polite"></div></div>

    <div class="sec"><h3>${t('set.voice')}</h3>
      <div class="field"><label>${t('set.voice.engine')}</label>${seg([['device', esc(t('set.voice.device'))], ['eleven', 'ElevenLabs']], S.voice.engine, 've')}</div>
      <div class="field"><label>${t('set.voice.pick')}</label>
        ${he.length ? `<select class="inp" id="dv"><option value="">${t('set.voice.auto')}</option>${he.map((v) => `<option value="${esc(v.name)}" ${v.name === S.voice.deviceVoice ? 'selected' : ''}>${esc(v.name)}${v.localService ? '' : ' · ' + esc(t('set.voice.cloud'))}</option>`).join('')}</select>` : `<div class="warn">${icon('info')}<span>${t('set.voice.novoice')}</span></div>`}</div>
      <div class="field"><label>${t('set.voice.rate')}: <span id="rv">${S.voice.rate}</span></label><input type="range" id="rate" min="0.7" max="1.3" step="0.05" value="${S.voice.rate}" style="width:100%"></div>
      <div class="field"><label>${t('set.el.key')}</label><input class="inp" id="elkey" type="password" dir="ltr" placeholder="sk_..." value="${esc(el.key)}" autocomplete="off"></div>
      <div class="row"><div class="grow small" dir="auto">${el.voiceName ? icon('mic') + ' ' + esc(el.voiceName) : t('set.el.novoice')}</div><button class="btn sm secondary" id="elpick">${t('set.el.pick')}</button></div>
      <div class="field"><label>${t('set.el.model')}</label><select class="inp" id="elmodel" dir="ltr">${opts([['eleven_v3', 'Eleven v3 (' + t('set.el.quality') + ')'], ['eleven_v3_conversational', 'Eleven v3 Conversational (' + t('set.el.fast') + ')']], el.modelHe)}</select></div>
      <p class="small muted">${t('set.el.hebrew')}</p>
      <div class="field"><label>${t('set.stt')}</label>${seg([['device', esc(t('set.voice.device'))], ['eleven', 'ElevenLabs Scribe']], S.voice.sttEngine, 'se')}
        ${!sttSupported() ? `<div class="warn gap">${icon('info')}<span>${t('set.stt.unsupported')}</span></div>` : ''}</div>
      <button class="btn secondary block" id="vtest">${icon('volume-2')}${t('set.voice.test')}</button></div>

    <div class="sec"><h3>${t('set.sound')}</h3>${seg([['1', esc(t('set.on'))], ['0', esc(t('set.off'))]], S.prefs.sound ? '1' : '0', 'sound')}</div>

    <div class="sec card"><h3>${t('set.install')}</h3><ol class="small" style="margin:0;padding-inline-start:20px"><li>${t('set.install.1')}</li><li>${t('set.install.2')}</li><li>${t('set.install.3')}</li><li>${t('set.install.4')}</li></ol></div>

    <div class="sec"><h3>${t('set.data')}</h3><div class="list"><button class="btn secondary block" id="exp">${icon('download')}${t('set.export')}</button><button class="btn danger block" id="rst">${icon('trash-2')}${t('set.reset')}</button></div></div>
    <p class="small muted center gap2">${t('set.about')}</p>`;

  $('#bk', root).onclick = () => go('#/profile');
  root.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.lang) { S.lang = d.lang; save(); await loadLang(S.lang); draw(root); }
    else if (d.g) { S.grade = Number(d.g); save(); draw(root); }
    else if (d.tr) { S.track = d.tr; save(); draw(root); }
    else if (d.ai) { S.ai.mode = d.ai; S.ai.chosen = true; save(); draw(root); }
    else if (d.ve) { S.voice.engine = d.ve; save(); draw(root); }
    else if (d.se) { S.voice.sttEngine = d.se; save(); draw(root); }
    else if (d.sound !== undefined) { S.prefs.sound = d.sound === '1'; flags.sound = S.prefs.sound; save(); draw(root); }
    else if (b.id === 'aitest') {
      const out = $('#aires', root); out.textContent = '…';
      if (!aiReady()) { out.innerHTML = `<div class="warn">${icon('info')}<span>${t('set.ai.notready')}</span></div>`; return; }
      try { const r = await chat({ system: 'Réponds uniquement par le mot OK.', messages: [{ role: 'user', content: 'test' }], maxTokens: 12 }); out.innerHTML = `<div class="ok">${icon('circle-check')}<span>${t('set.ai.works')} (${esc(r.slice(0, 20))})</span></div>`; }
      catch (err) { out.innerHTML = `<div class="warn">${icon('circle-alert')}<span>${esc(err.code || '')} ${esc((err.message || '').slice(0, 140))}</span></div>`; }
    }
    else if (b.id === 'vtest') { unlockAudio(); stopSpeaking(); speak(t('set.voice.phrase'), { lang: 'he' }); }
    else if (b.id === 'elpick') pickVoice(root);
    else if (b.id === 'exp') {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' })); a.download = 'moreh-bakis-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    else if (b.id === 'rst') modal({ title: t('set.reset'), body: `<p>${t('set.reset.ask')}</p>`, actions: [{ label: t('set.reset.yes'), cls: 'danger', onClick: () => { resetAll(); location.hash = '#/welcome'; location.reload(); } }, { label: t('set.reset.no'), cls: 'secondary' }] });
  };
  root.oninput = (e) => {
    const i = e.target;
    if (i.id === 'nm') S.name = i.value.trim();
    else if (i.id === 'aikey') S.ai.key = i.value.trim();
    else if (i.id === 'aiurl') S.ai.proxyUrl = i.value.trim();
    else if (i.id === 'elkey') S.voice.eleven.key = i.value.trim();
    else if (i.id === 'rate') { S.voice.rate = Number(i.value); $('#rv', root).textContent = i.value; }
    save();
  };
  root.onchange = (e) => {
    const i = e.target;
    if (i.id === 'model') S.ai.model = i.value;
    else if (i.id === 'vmodel') S.ai.visionModel = i.value;
    else if (i.id === 'dv') S.voice.deviceVoice = i.value;
    else if (i.id === 'elmodel') S.voice.eleven.modelHe = i.value;
    save();
  };
}

// Choix d'une voix ElevenLabs : voix du compte, puis recherche de voix hébraïques dans la bibliothèque.
async function pickVoice(root) {
  const el = S.voice.eleven;
  if (!el.key) { toast(t('set.el.needkey')); return; }
  let preview = null;
  const m = modal({
    title: t('set.el.pick'),
    body: '<div id="vl" class="group"><p class="muted" style="padding:12px 16px">…</p></div>',
    actions: [
      { label: t('set.el.searchhe'), icon: 'search', cls: 'secondary', keep: true, onClick: async () => { await show(await elevenSearchHebrew().catch((err) => { toast(t('set.el.err') + ' ' + err.message); return []; }), true); } },
      { label: t('close'), cls: 'quiet' },
    ],
  });
  const listEl = $('#vl', m.el);
  async function show(voices, library) {
    window.__elv = voices;
    listEl.innerHTML = voices.length ? voices.map((v, i) => `<div class="item"><span class="grow" dir="auto"><b>${esc(v.name)}</b><span class="sub">${esc([v.labels?.accent || v.accent, v.labels?.gender || v.gender, v.labels?.use_case || v.use_case].filter(Boolean).join(' · '))}</span></span>${v.preview_url ? `<button class="icon" data-p="${i}" aria-label="${t('set.voice.test')}">${icon('play')}</button>` : ''}<button class="btn sm secondary" data-s="${i}" data-lib="${library ? 1 : 0}" aria-label="${esc(t('set.el.choose'))}">${icon('check')}</button></div>`).join('') : `<p class="muted">${t('set.el.none')}</p>`;
  }
  listEl.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const v = window.__elv?.[Number(b.dataset.p ?? b.dataset.s)];
    if (!v) return;
    if (b.dataset.p !== undefined) { try { preview?.pause(); preview = new Audio(v.preview_url); preview.play(); } catch { /* ignoré */ } return; }
    try {
      const id = b.dataset.lib === '1' ? await elevenAddShared(v) : v.voice_id;
      S.voice.eleven.voiceId = id; S.voice.eleven.voiceName = v.name; S.voice.engine = 'eleven'; save();
      toast(t('set.el.chosen', { n: v.name })); m.close(); draw(root);
    } catch (err) { toast(t('set.el.err') + ' ' + err.message); }
  };
  try { await show(await elevenVoices(), false); } catch (err) { listEl.innerHTML = `<p class="warn">${t('set.el.err')} ${esc(err.message)}</p>`; }
}

export const settings = { render(root) { draw(root); } };
