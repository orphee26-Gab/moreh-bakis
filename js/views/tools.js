// Outils : photo d'un exercice, appel en direct avec Nitzotz, réservation d'un vrai prof (démonstration).
import { S, save } from '../store.js';
import { t, lang as uiLang } from '../i18n.js';
import { $, esc, toast, modal, mascot, setMascot, confetti, sfx } from '../ui.js';
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
        <div class="center gap">${mascot('idle', 120)}<h1 class="h1 gap">${t('cam.title')}</h1><p class="muted">${t('cam.sub')}</p></div>
        <button class="btn sun block gap2" id="shoot">📷 ${t('cam.shoot')}</button>
        <button class="btn ghost block gap" id="gal">🖼️ ${t('cam.gallery')}</button>
        ${aiReady() ? '' : `<div class="warn small gap2">${t('cam.demo')}</div>`}`;
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
      root.innerHTML = `<img src="${img.dataUrl}" alt="" style="width:100%;max-height:34dvh;object-fit:contain;border-radius:18px;background:#0006"><div class="center gap2">${mascot('thinking', 100)}<p>${t('cam.reading')}</p></div>`;
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
          <div class="top"><button class="icon" id="bk" aria-label="${t('back')}"><span class="arr">→</span></button><h2 class="h2 grow">${t('cam.result')}</h2></div>
          <img src="${img.dataUrl}" alt="" style="width:100%;max-height:26dvh;object-fit:contain;border-radius:18px;background:#0006">
          <div class="chips">${meta ? `<span class="pill">${meta.icon} ${esc(t('subj.' + meta.id))}</span>` : ''}${r.topic ? `<span class="pill" dir="auto">${esc(r.topic)}</span>` : ''}</div>
          ${r.board ? `<div class="board" dir="auto" style="max-height:none">${esc(r.board)}</div>` : ''}
          <div class="card gap" dir="auto">${esc(r.say || '')}</div>
          <div id="hl">${hints.slice(0, shown).map((h, k) => `<div class="explain" dir="auto"><b>💡 ${k + 1}.</b> ${esc(h)}</div>`).join('')}</div>
          ${sol ? `<div class="card gap" dir="auto"><b>${t('cam.solution')}</b><ol>${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${r.answer ? `<p><b>${t('cam.answer')}:</b> ${esc(r.answer)}</p>` : ''}</div>` : ''}
          <div class="list gap2">
            ${shown < hints.length ? `<button class="btn violet block" id="hint">💡 ${shown ? t('cam.morehint') : t('cam.hint')}</button>` : ''}
            ${!sol && steps.length ? `<button class="btn ghost block" id="sol">${t('cam.showsol')}</button>` : ''}
            <button class="btn sun block" id="talk">💬 ${t('cam.talk')}</button>
            <button class="btn ghost block" id="teach">👩‍🏫 ${t('map.teacher')}</button>
          </div>`;
        $('#bk', root).onclick = home;
        const hb = $('#hint', root); if (hb) hb.onclick = () => { shown++; draw(); };
        const sb = $('#sol', root); if (sb) sb.onclick = () => modal({ title: t('cam.sure'), body: `<p>${t('cam.suretext')}</p>`, actions: [{ label: t('cam.tryfirst'), cls: '' }, { label: t('cam.yes'), cls: 'ghost', onClick: () => { sol = true; draw(); } }] });
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
          ${mascot('idle', 140)}
          <h1 class="h1">${t('call.title')}</h1>
          <p class="muted">${t('call.sub')}</p>
          ${ctx?.topic ? `<div class="pill" dir="auto">${esc(ctx.topic)}</div>` : ''}
          <div class="chips" style="justify-content:center" id="sj">${SUBJECTS.map((s) => `<button class="chip ${s.id === sid ? 'on' : ''}" data-s="${s.id}">${s.icon} ${esc(t('subj.' + s.id))}</button>`).join('')}</div>
          ${sid === 'english' ? `<p class="small muted">${t('call.oral')}</p>` : ''}
          <button class="btn block" id="go">📞 ${t('call.start')}</button>
          <button class="btn ghost block" id="bk">${t('back')}</button>
          ${aiReady() ? '' : `<div class="warn small">${t('call.demo')}</div>`}
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
          <div id="m" style="cursor:pointer">${mascot('idle', 170)}</div>
          <div class="status" id="st"></div>
          <div class="say" id="say" dir="auto"></div>
          <div class="you" id="you" dir="auto"></div>
          <div class="btns">
            <button class="round on" id="mute" aria-label="${t('call.mute')}">🎙️</button>
            <button class="round end" id="end" aria-label="${t('call.end')}">📞</button>
          </div>
          <div class="small muted">${t('call.tip')}</div>
        </div>`;
      const st = (k) => { $('#st', root).textContent = t('call.st.' + k); setMascot(root, { listen: 'listening', think: 'thinking', speak: 'speaking' }[k] || 'idle'); };
      const sayEl = $('#say', root), youEl = $('#you', root);
      const pause = () => { me.muted = true; const mb = $('#mute', root); if (mb) mb.className = 'round'; st('paused'); };
      const finishCall = () => {
        if (me.exchanges >= 1) { S.stats.calls++; save(); addXP(20); confetti(); sfx('win'); toast(t('call.bye', { xp: 20 })); }
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
        me.muted = !me.muted; e.currentTarget.className = 'round ' + (me.muted ? '' : 'on');
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
        <div class="top"><button class="icon" id="bk" aria-label="${t('back')}"><span class="arr">→</span></button><h1 class="h1 grow">👩‍🏫 ${t('teach.title')}</h1></div>
        <div class="warn small">${t('teach.demo')}</div>
        <p class="muted">${t('teach.sub', { price: PRICE })}</p>
        <div class="list">${(items.length ? items : TEACHERS).map((x) => `<button class="item" data-id="${x.id}"><div class="avatar">${esc(x.name[0])}</div><div class="grow"><b>${esc(x.name)} <span class="tag">${t('teach.example')}</span></b><div class="small muted" dir="auto">${esc(x.bio)}</div><div class="small">⭐ ${x.rating} · ${PRICE} ₪ · 45 ${t('teach.min')}</div></div></button>`).join('')}</div>`;
      $('#bk', root).onclick = () => history.back();
      root.querySelectorAll('.item').forEach((b) => { b.onclick = () => pick(TEACHERS.find((x) => x.id === b.dataset.id)); });
    };
    const pick = (tc) => {
      let slot = null;
      const sl = slotsFor();
      root.innerHTML = `
        <div class="top"><button class="icon" id="bk" aria-label="${t('back')}"><span class="arr">→</span></button><h1 class="h1 grow">${esc(tc.name)}</h1></div>
        <p class="muted" dir="auto">${esc(tc.bio)}</p>
        <h3 class="h2 gap">${t('teach.slots')}</h3>
        <div class="chips" id="sl">${sl.map((s) => `<button class="slot" data-k="${esc(s.key)}">${esc(s.label)}</button>`).join('')}</div>
        <button class="btn block gap2" id="ok" disabled>${t('teach.continue')}</button>`;
      $('#bk', root).onclick = list;
      $('#sl', root).onclick = (e) => { const b = e.target.closest('.slot'); if (!b) return; slot = sl.find((s) => s.key === b.dataset.k); root.querySelectorAll('.slot').forEach((x) => x.classList.toggle('on', x === b)); $('#ok', root).disabled = false; };
      $('#ok', root).onclick = () => summary(tc, slot);
    };
    const summary = (tc, slot) => {
      root.innerHTML = `
        <div class="top"><button class="icon" id="bk" aria-label="${t('back')}"><span class="arr">→</span></button><h1 class="h1 grow">${t('teach.summary')}</h1></div>
        <div class="card"><div class="kv"><span>${t('teach.teacher')}</span><b>${esc(tc.name)}</b></div><div class="kv"><span>${t('teach.when')}</span><b>${esc(slot.label)}</b></div><div class="kv"><span>${t('teach.price')}</span><b>${PRICE} ₪</b></div>
        <div class="kv"><span>${t('teach.toteacher')}</span><span>${TEACHER_SHARE} ₪</span></div><div class="kv"><span>${t('teach.toapp')}</span><span>${PRICE - TEACHER_SHARE} ₪</span></div></div>
        <div class="ok small gap">${t('teach.brief', { n: S.stats.questions })}</div>
        <p class="muted small">${t('teach.parent')}</p>
        <button class="btn sun block gap" id="send">${t('teach.send')}</button>`;
      $('#bk', root).onclick = () => pick(tc);
      $('#send', root).onclick = () => {
        confetti(); sfx('win');
        root.innerHTML = `<div class="center gap2">${mascot('happy', 130)}<h1 class="h1 gap">${t('teach.sent')}</h1><p class="muted">${t('teach.sentsub')}</p><div class="warn small gap">${t('teach.demo')}</div><button class="btn block gap2" id="h">${t('nav.home')}</button></div>`;
        $('#h', root).onclick = () => go('#/home');
      };
    };
    list();
  },
};
