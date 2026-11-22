// Outils : photo d'un exercice, appel en direct avec Nitzotz, réservation d'un vrai prof (démonstration).
import { S, save } from '../store.js';
import { t, lang as uiLang } from '../i18n.js';
import { $, esc, toast, modal, mascot, setMascot, sfx } from '../ui.js';
import { icon, tick } from '../icons.js';
import { SUBJECTS, subjectMeta, gradeLabel } from '../curriculum.js';
import { chat, parseJSON, aiReady, aiErrorKey, fileToJpeg } from '../ai.js';
import { cameraSystem, callSystem } from '../prompts.js';
import { speak, stopSpeaking, listen, micAvailable, unlockAudio } from '../voice.js';
import { addXP, spendEnergy, paywall } from '../game.js';

const go = (h) => { location.hash = h; };

/* ---------- appareil photo ---------- */
function pickImage(capture) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; if (capture) inp.setAttribute('capture', 'environment');
    inp.style.display = 'none'; document.body.appendChild(inp);
    inp.onchange = () => { const f = inp.files?.[0] || null; inp.remove(); resolve(f); };
    inp.oncancel = () => { inp.remove(); resolve(null); };
    inp.click();
  });
}

export const camera = {
  async render(root) {
    const home = () => {
      root.innerHTML = `
        <div class="gap3"><span class="empty">${icon('camera')}</span></div>
        <h1 class="h1 center gap2">${t('cam.title')}</h1><p class="muted center gap">${t('cam.sub')}</p>
        <button class="btn block gap3" id="shoot">${icon('camera')}${t('cam.shoot')}</button>
        <button class="btn secondary block gap" id="gal">${icon('image')}${t('cam.gallery')}</button>
        ${aiReady() ? '' : `<div class="warn gap2">${icon('info')}<span>${t('cam.demo')}</span></div>`}`;
      $('#shoot', root).onclick = () => start(true);
      $('#gal', root).onclick = () => start(false);
    };
    const start = async (cap) => {
      unlockAudio();
      const file = await pickImage(cap);
      if (!file) return;
      if (!spendEnergy()) { paywall(); return; }
      analyze(file);
    };
    const analyze = async (file) => {
      let img;
      try { img = await fileToJpeg(file); } catch { toast(t('cam.badimg')); return home(); }
      root.innerHTML = `<img class="photo gap" src="${img.dataUrl}" alt=""><div class="row gap2" style="justify-content:center">${mascot('thinking', 48)}<p class="muted">${t('cam.reading')}</p></div>`;
      let r;
      if (!aiReady()) {
        r = { say: t('cam.demosay'), board: '', subject: 'other', topic: '', hints: [t('cam.demohint')], solution: [], answer: '' };
      } else {
        try {
          const raw = await chat({ vision: true, system: cameraSystem(gradeLabel(S.grade)), maxTokens: 1600, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.base64 } }, { type: 'text', text: 'הנה התרגיל שלי.' }] }] });
          r = parseJSON(raw) || { say: raw, board: '', subject: 'other', topic: '', hints: [], solution: [], answer: '' };
        } catch (e) { toast(t(aiErrorKey(e))); return home(); }
      }
      S.stats.photos++; save(); addXP(15);
      const hints = Array.isArray(r.hints) ? r.hints : [], steps = Array.isArray(r.solution) ? r.solution : [];
      let shown = 0, sol = false;
      const meta = subjectMeta(r.subject);
      const draw = () => {
        root.innerHTML = `
          <div class="top"><button class="icon" id="bk" aria-label="${t('back')}">${icon('back')}</button><h1 class="h2">${t('cam.result')}</h1></div>
          <img class="photo" src="${img.dataUrl}" alt="">
          ${meta || r.topic ? `<p class="row small muted gap">${meta ? `${icon(meta.icon)}<span>${esc(t('subj.' + meta.id))}</span>` : ''}${r.topic ? `<span dir="auto">${meta ? '· ' : ''}${esc(r.topic)}</span>` : ''}</p>` : ''}
          ${r.board ? `<div class="board gap" dir="auto" style="max-height:none">${esc(r.board)}</div>` : ''}
          <div class="card gap" dir="auto">${esc(r.say || '')}</div>
          <div id="hl">${hints.slice(0, shown).map((h, k) => `<div class="explain" dir="auto"><span class="small muted">${icon('lightbulb')} ${t('cam.hintn', { n: k + 1 })}</span><div>${esc(h)}</div></div>`).join('')}</div>
          ${sol ? `<div class="card gap" dir="auto"><b>${t('cam.solution')}</b><ol>${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${r.answer ? `<p><b>${t('cam.answer')}:</b> ${esc(r.answer)}</p>` : ''}</div>` : ''}
          <div class="list gap2">
            ${shown < hints.length ? `<button class="btn block" id="hint">${icon('lightbulb')}${shown ? t('cam.morehint') : t('cam.hint')}</button>` : ''}
            <button class="btn ${shown < hints.length ? 'secondary' : ''} block" id="talk">${icon('message-circle')}${t('cam.talk')}</button>
            ${!sol && steps.length ? `<button class="btn secondary block" id="sol">${t('cam.showsol')}</button>` : ''}
            <button class="btn quiet block" id="teach">${icon('video')}${t('map.teacher')}</button>
          </div>`;
        $('#bk', root).onclick = home;
        const hb = $('#hint', root); if (hb) hb.onclick = () => { shown++; draw(); };
        const sb = $('#sol', root); if (sb) sb.onclick = () => modal({ title: t('cam.sure'), body: `<p>${t('cam.suretext')}</p>`, actions: [{ label: t('cam.tryfirst'), cls: '' }, { label: t('cam.yes'), cls: 'secondary', onClick: () => { sol = true; draw(); } }] });
        $('#talk', root).onclick = () => { sessionStorage.setItem('mb.callctx', JSON.stringify({ subject: r.subject, topic: r.topic, extra: `L'élève travaille sur cet exercice : ${r.board || ''}. Aide-le oralement sans donner la solution d'un coup.` })); go('#/call'); };
        $('#teach', root).onclick = () => go(`#/teachers?subject=${r.subject || ''}`);
      };
      draw();
      if (r.say) speak(r.say, { lang: r.subject === 'english' ? 'en' : 'he' });
    };
    home();
  },
  destroy() { stopSpeaking(); },
};

/* ---------- appel en direct ---------- */
let C = null;
export const call = {
  fullscreen: true,
  async render(root, { q }) {
    call.destroy();
    const ctx = JSON.parse(sessionStorage.getItem('mb.callctx') || 'null'); sessionStorage.removeItem('mb.callctx');
    let sid = q.get('subject') || ctx?.subject || 'english';
    if (!subjectMeta(sid)) sid = 'math';
    const pickScreen = () => {
      root.innerHTML = `
        <div class="call">
          ${mascot('idle', 96)}
          <h1 class="h1">${t('call.title')}</h1>
          <p class="muted">${t('call.sub')}</p>
          ${ctx?.topic ? `<p class="small" dir="auto">${esc(ctx.topic)}</p>` : ''}
          <div class="chips" id="sj" role="group" aria-label="${esc(t('call.pick'))}">${SUBJECTS.map((s) => `<button class="chip ${s.id === sid ? 'on' : ''}" data-s="${s.id}" aria-pressed="${s.id === sid}">${icon(s.icon)}${esc(t('subj.' + s.id))}</button>`).join('')}</div>
          ${sid === 'english' ? `<p class="small muted">${t('call.oral')}</p>` : ''}
          <button class="btn block" id="go">${icon('phone')}${t('call.start')}</button>
          <button class="btn secondary block" id="bk">${t('back')}</button>
          ${aiReady() ? '' : `<div class="warn">${icon('info')}<span>${t('call.demo')}</span></div>`}
        </div>`;
      $('#sj', root).onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { sid = b.dataset.s; pickScreen(); } };
      $('#bk', root).onclick = () => go('#/home');
      $('#go', root).onclick = () => { unlockAudio(); begin(); };
    };
    const begin = () => {
      const meta = subjectMeta(sid), lng = meta.lang === 'en' ? 'en' : 'he';
      const me = C = { aborted: false, muted: false, msgs: [], exchanges: 0, listener: null, empty: 0 };
      root.innerHTML = `
        <div class="call">
          <div id="m" style="cursor:pointer">${mascot('idle', 144)}</div>
          <div class="status" id="st" aria-live="polite"></div>
          <div class="say" id="say" dir="auto"></div>
          <div class="you" id="you" dir="auto"></div>
          <div class="btns">
            <button class="round on" id="mute" aria-label="${t('call.mute')}" aria-pressed="false">${icon('mic')}</button>
            <button class="round end" id="end" aria-label="${t('call.end')}">${icon('phone-off')}</button>
          </div>
          <div class="small muted">${t('call.tip')}</div>
        </div>`;
      const st = (k) => { $('#st', root).textContent = t('call.st.' + k); setMascot(root, { listen: 'listening', think: 'thinking', speak: 'speaking' }[k] || 'idle'); };
      const sayEl = $('#say', root), youEl = $('#you', root);
      const muteBtn = (muted) => { const mb = $('#mute', root); if (!mb) return; mb.className = 'round ' + (muted ? '' : 'on'); mb.innerHTML = icon(muted ? 'mic-off' : 'mic'); mb.setAttribute('aria-pressed', String(muted)); };
      const pause = () => { me.muted = true; muteBtn(true); st('paused'); };
      const finishCall = () => {
        if (me.exchanges >= 1) { S.stats.calls++; save(); addXP(20); sfx('win'); toast(t('call.bye', { xp: 20 })); }
        call.destroy(); go('#/home');
      };
      async function listenLoop() {
        if (me.aborted || me.muted) return;
        if (!micAvailable()) { st('nomic'); $('#you', root).textContent = t('call.nomic'); return; }
        st('listen');
        const h = listen({ lang: lng, onInterim: (x) => { youEl.textContent = x; } });
        me.listener = h;
        try {
          const text = await h.promise;
          if (me.aborted) return;
          if (text) { me.empty = 0; youEl.textContent = text; me.exchanges++; await turn(text); }
          else if (++me.empty < 3) listenLoop();
          else { pause(); }
        } catch (e) {
          if (me.aborted) return;
          pause(); youEl.textContent = e.code === 'not-allowed' || e.code === 'service-not-allowed' ? t('lesson.micblocked') : t('lesson.mictry');
        }
      }
      async function turn(userText) {
        st('think');
        let reply;
        if (!aiReady()) reply = t('call.demosay');
        else {
          me.msgs.push({ role: 'user', content: userText });
          try { reply = await chat({ system: callSystem({ subject: t('subj.' + sid), topic: ctx?.topic, extra: ctx?.extra, lang: lng }), messages: me.msgs.slice(-12), maxTokens: 220 }); }
          catch (e) { pause(); youEl.textContent = t(aiErrorKey(e)); return; }
          me.msgs.push({ role: 'assistant', content: reply });
        }
        if (me.aborted) return;
        sayEl.textContent = reply; st('speak');
        await speak(reply, { lang: lng });
        if (me.aborted) return;
        if (!aiReady()) { pause(); return; }
        listenLoop();
      }
      $('#m', root).onclick = () => { stopSpeaking(); };
      $('#mute', root).onclick = (e) => {
        me.muted = !me.muted; muteBtn(me.muted);
        if (me.muted) { try { me.listener?.stop(); } catch { /* ignoré */ } st('muted'); } else listenLoop();
      };
      $('#end', root).onclick = finishCall;
      turn(lng === 'en' ? 'Hello!' : 'שלום!');
    };
    pickScreen();
  },
  destroy() {
    if (C) { C.aborted = true; try { C.listener?.stop(); } catch { /* ignoré */ } }
    stopSpeaking(); C = null;
  },
};

/* ---------- vrai prof en visio : démonstration, rien n'est envoyé ni payé ---------- */
const PRICE = 80, TEACHER_SHARE = 64;
const TEACHERS = [
  { id: 't1', name: 'דנה ל.', subject: 'math', rating: 4.9, bio: 'מתמטיקה 4–5 יח״ל, הכנה לבגרות ולמתכונת.' },
  { id: 't2', name: 'יואב ר.', subject: 'physics', rating: 4.8, bio: 'פיזיקה 5 יח״ל: מכניקה וחשמל, פתרון שאלות בגרות.' },
  { id: 't3', name: 'מיכל ש.', subject: 'english', rating: 4.9, bio: 'אנגלית 3–5 יח״ל, התמקדות בבחינה בעל פה.' },
  { id: 't4', name: 'אורי ב.', subject: 'history', rating: 4.7, bio: 'היסטוריה ותנ״ך: סיכומים, חזרות ומיקוד לבחינה.' },
  { id: 't5', name: 'נועה ג.', subject: 'hebrew', rating: 4.8, bio: 'הבנה, הבעה ולשון: כתיבה מסכמת ולשון.' },
];
const slotsFor = () => {
  const out = [];
  for (let d = 1; d <= 3; d++) {
    const day = new Date(Date.now() + d * 864e5);
    ['17:00', '18:30', '20:00'].forEach((h) => out.push({ label: `${day.toLocaleDateString(uiLang() === 'fr' ? 'fr-FR' : 'he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' })} · ${h}`, key: `${day.toDateString()}${h}` }));
  }
  return out;
};
export const teachers = {
  async render(root, { q }) {
    const want = q.get('subject');
    const list = () => {
      const items = TEACHERS.filter((x) => !want || x.subject === want || want === 'other' || !subjectMeta(want));
      root.innerHTML = `
        <div class="top"><button class="icon" id="bk" aria-label="${t('back')}">${icon('back')}</button><h1 class="h1">${t('teach.title')}</h1></div>
        <div class="warn">${icon('info')}<span>${t('teach.demo')}</span></div>
        <p class="muted gap">${t('teach.sub', { price: PRICE })}</p>
        <div class="group gap">${(items.length ? items : TEACHERS).map((x) => `<button class="item" data-id="${x.id}"><div class="avatar" aria-hidden="true">${esc(x.name[0])}</div><span class="grow"><b>${esc(x.name)} <span class="tag">${t('teach.example')}</span></b><span class="sub" dir="auto">${esc(x.bio)}</span><span class="sub num">${icon('star')} ${x.rating} · ${PRICE} ₪ · 45 ${t('teach.min')}</span></span>${icon('fwd', 'fwd')}</button>`).join('')}</div>`;
      $('#bk', root).onclick = () => history.back();
      root.querySelectorAll('.item[data-id]').forEach((b) => { b.onclick = () => pick(TEACHERS.find((x) => x.id === b.dataset.id)); });
    };
    const pick = (tc) => {
      let slot = null;
      const sl = slotsFor();
      root.innerHTML = `
        <div class="top"><button class="icon" id="bk" aria-label="${t('back')}">${icon('back')}</button><h1 class="h1">${esc(tc.name)}</h1></div>
        <p class="muted" dir="auto">${esc(tc.bio)}</p>
        <h2 class="sec-h sec">${t('teach.slots')}</h2>
        <div class="slots num" id="sl">${sl.map((s) => `<button class="slot" data-k="${esc(s.key)}" aria-pressed="false">${esc(s.label)}</button>`).join('')}</div>
        <button class="btn block gap2" id="ok" disabled>${t('teach.continue')}</button>`;
      $('#bk', root).onclick = list;
      $('#sl', root).onclick = (e) => { const b = e.target.closest('.slot'); if (!b) return; slot = sl.find((s) => s.key === b.dataset.k); root.querySelectorAll('.slot').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); $('#ok', root).disabled = false; };
      $('#ok', root).onclick = () => summary(tc, slot);
    };
    const summary = (tc, slot) => {
      root.innerHTML = `
        <div class="top"><button class="icon" id="bk" aria-label="${t('back')}">${icon('back')}</button><h1 class="h1">${t('teach.summary')}</h1></div>
        <div class="card"><div class="kv"><span>${t('teach.teacher')}</span><b>${esc(tc.name)}</b></div><div class="kv"><span>${t('teach.when')}</span><b>${esc(slot.label)}</b></div><div class="kv"><span>${t('teach.price')}</span><b>${PRICE} ₪</b></div>
        <div class="kv"><span>${t('teach.toteacher')}</span><span>${TEACHER_SHARE} ₪</span></div><div class="kv"><span>${t('teach.toapp')}</span><span>${PRICE - TEACHER_SHARE} ₪</span></div></div>
        <div class="ok gap">${icon('circle-check')}<span>${t('teach.brief', { n: S.stats.questions })}</span></div>
        <p class="muted small gap">${t('teach.parent')}</p>
        <button class="btn block gap2" id="send">${t('teach.send')}</button>`;
      $('#bk', root).onclick = () => pick(tc);
      $('#send', root).onclick = () => {
        sfx('win');
        root.innerHTML = `<div class="gap3"><span class="empty">${tick()}</span></div><h1 class="h1 center gap2">${t('teach.sent')}</h1><p class="muted center gap">${t('teach.sentsub')}</p><div class="warn gap2">${icon('info')}<span>${t('teach.demo')}</span></div><button class="btn block gap2" id="h">${t('nav.home')}</button>`;
        $('#h', root).onclick = () => go('#/home');
      };
    };
    list();
  },
};
