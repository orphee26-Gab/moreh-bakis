// Carte des thèmes, micro-leçon (à la voix ou à l'écrit) et quiz.
import { S, save } from '../store.js';
import { t } from '../i18n.js';
import { $, esc, toast, modal, mascot, setMascot, confetti, sfx } from '../ui.js';
import { SUBJECTS, subjectMeta, loadSubject, unitsAvailable, unitsFor, topicsFor, findTopic, tr, gradeLabel, gradeText, progressOf } from '../curriculum.js';
import { loadFaculty, findCourse } from '../faculty.js';
import { chat, parseJSON, aiReady, aiErrorKey } from '../ai.js';
import { tutorSystem, quizSystem } from '../prompts.js';
import { speak, stopSpeaking, listen, micAvailable, unlockAudio } from '../voice.js';
import { addXP, spendEnergy, paywall, markDone } from '../game.js';
import { createDemo, demoQuiz } from '../demo.js';

const go = (h) => { location.hash = h; };

/* ---------- description d'un thème (lycée ou faculté) ---------- */
async function describe(args, q) {
  if (args[0] === 'academy') {
    const [, instId, courseId, idx] = args;
    const f = await findCourse(await loadFaculty(), instId, courseId);
    if (!f) return null;
    const topics = f.course.topics || [];
    const tp = topics[Number(idx)];
    return {
      kind: 'academy', key: `acad:${instId}:${courseId}:${idx}`, subjectId: 'academy', lang: 'he',
      title: tp ? (tp.he || tr(tp)) : (f.course.he || tr(f.course)),
      subs: topics.map((x) => x.he || tr(x)).filter(Boolean).slice(0, 12),
      inst: f.inst.name?.he || tr(f.inst.name), course: f.course.he || tr(f.course), code: f.course.code || '',
      subjectName: f.course.he || tr(f.course), back: `#/academy/course/${instId}/${courseId}`,
      next: tp && topics[Number(idx) + 1] ? `${instId}/${courseId}/${Number(idx) + 1}` : null,
    };
  }
  const [sid, topicId] = args;
  const meta = subjectMeta(sid);
  if (!meta) return null;
  const data = await loadSubject(sid);
  const base = { kind: 'school', subjectId: sid, subjectName: t('subj.' + sid), lang: meta.lang || 'he', back: `#/map/${sid}` };
  if (topicId === 'boss') {
    const units = Number(q.get('u')) || unitsFor(meta, data);
    const grade = Number(q.get('g')) || S.grade;
    const { topics } = topicsFor(data, units, grade);
    return { ...base, key: `boss:${sid}:${units}:${grade}`, units, grade, gradeLabel: gradeLabel(grade), title: t('map.boss'), subs: topics.slice(0, 12).map((x) => x.he || tr(x)), boss: true };
  }
  const f = findTopic(data, topicId);
  if (!f) return null;
  const grade = f.grade === 'all' ? S.grade : Number(f.grade);
  const list = topicsFor(data, f.units, grade).topics;
  const idx = list.findIndex((x) => x.id === topicId);
  return {
    ...base, key: topicId, units: f.units, grade, gradeLabel: gradeLabel(grade),
    title: f.topic.he || tr(f.topic), subs: (f.topic.subtopics || []).map((x) => x.he || tr(x)).filter(Boolean),
    next: idx >= 0 && list[idx + 1] ? list[idx + 1].id : null,
  };
}

/* ---------- carte d'une matière ---------- */
export const map = {
  async render(root, { args }) {
    const meta = subjectMeta(args[0]) || SUBJECTS[0];
    const data = await loadSubject(meta.id);
    const avail = unitsAvailable(meta, data);
    let units = unitsFor(meta, data);
    const draw = () => {
      const grade = S.grade;
      const { topics, approx } = topicsFor(data, units, grade);
      const prog = progressOf(data, units, grade);
      const nodes = topics.map((tp, i) => {
        const done = S.done[tp.id], open = i === 0 || S.done[topics[i - 1].id];
        const cls = done ? 'done' : open ? 'cur' : 'lock';
        return `<button class="node ${cls} z${i % 4}" data-i="${i}"><span class="orb">${done ? '★' : open ? i + 1 : '🔒'}</span><span class="lbl" dir="auto">${esc(tr(tp))}</span></button>`;
      }).join('');
      root.innerHTML = `
        <div class="top"><button class="icon" data-act="back" aria-label="${t('back')}"><span class="arr">→</span></button><div class="grow"><div class="h1">${meta.icon} ${esc(t('subj.' + meta.id))}</div></div></div>
        <div class="chips" id="uc">${avail.map((u) => `<button class="chip ${u === units ? 'on' : ''}" data-u="${u}">${u} ${t('units')}</button>`).join('')}</div>
        <div class="chips" id="gc">${[10, 11, 12].map((g) => `<button class="chip ${g === S.grade ? 'on' : ''}" data-g="${g}">${gradeText(g)}</button>`).join('')}</div>
        ${data?.status === 'draft' ? `<div class="warn small">${t('map.draft')}</div>` : ''}
        ${approx ? `<div class="warn small gap">${t('map.approx')}</div>` : ''}
        ${topics.length
          ? `<div class="lvl gap"><i style="width:${prog.pct}%"></i></div><div class="muted small">${prog.done}/${prog.total}</div>
             <div class="path">${nodes}<button class="node boss z${topics.length % 4}" data-boss="1"><span class="orb">🏆</span><span class="lbl">${t('map.boss')}</span></button></div>`
          : `<div class="card gap center"><p>${t('map.empty')}</p></div>`}`;
      root.onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.act === 'back') return go('#/learn');
        if (b.dataset.u) { units = Number(b.dataset.u); S.units[meta.id] = units; save(); return draw(); }
        if (b.dataset.g) { S.grade = Number(b.dataset.g); save(); return draw(); }
        if (b.dataset.boss) return go(`#/quiz/${meta.id}/boss?u=${units}&g=${S.grade}`);
        if (b.dataset.i !== undefined) {
          const i = Number(b.dataset.i), tp = topics[i];
          const open = i === 0 || S.done[topics[i - 1].id];
          const subs = (tp.subtopics || []).map((x) => esc(tr(x))).join(' · ');
          const base = `#/lesson/${meta.id}/${tp.id}`;
          modal({
            title: tr(tp),
            body: `${subs ? `<p class="muted small" dir="auto">${subs}</p>` : ''}${open ? '' : `<p class="warn small">${t('map.locked')}</p>`}`,
            actions: [
              { label: '🎙️ ' + t('map.voice'), onClick: () => { unlockAudio(); go(`${base}?mode=voice`); } },
              { label: '⌨️ ' + t('map.text'), cls: 'violet', onClick: () => go(`${base}?mode=text`) },
              { label: '🧩 ' + t('map.quiz'), cls: 'sun', onClick: () => go(`#/quiz/${meta.id}/${tp.id}`) },
              { label: '👩‍🏫 ' + t('map.teacher'), cls: 'ghost', onClick: () => go(`#/teachers?subject=${meta.id}`) },
            ],
          });
        }
      };
    };
    draw();
  },
};

/* ---------- micro-leçon ---------- */
let cur = null;
export const lesson = {
  fullscreen: true,
  async render(root, { args, q }) {
    lesson.destroy();
    const d = await describe(args, q);
    if (!d) { root.innerHTML = `<div class="screen"><p class="center gap2">${t('lesson.notfound')}</p><button class="btn block" data-back>${t('back')}</button></div>`; $('[data-back]', root).onclick = () => history.back(); return; }
    if (!spendEnergy()) { paywall(); history.back(); return; }
    S.last = { hash: location.hash, title: d.title, subject: d.subjectName }; save();
    const L = cur = { d, mode: q.get('mode') === 'text' ? 'text' : 'voice', msgs: [], right: 0, answered: 0, hints: 0, turns: 0, done: false, busy: false, listening: false, aborted: false, listener: null, demo: aiReady() ? null : createDemo(d), marks: [], auto: true };
    const START = d.lang === 'en' ? 'Start the lesson.' : 'התחילו את השיעור.';
    root.innerHTML = `
      <div class="lesson-top">
        <button class="icon" id="x" aria-label="${t('close')}">✕</button>
        <div class="dots" id="dots"><span></span><span></span><span></span></div>
        <button class="icon" id="mode" aria-label="${t('lesson.switch')}">${L.mode === 'voice' ? '⌨️' : '🎙️'}</button>
      </div>
      ${L.demo ? `<div class="warn small" style="margin:0 14px 6px">${t('lesson.demo')}</div>` : ''}
      <div class="stage">${mascot('idle', 84)}<div class="board" id="board" dir="auto"></div></div>
      <div class="chat" id="chat"></div>
      <div class="dock" id="dock">
        <button class="tool" id="hint" aria-label="${t('lesson.hint')}">💡</button>
        <button class="mic" id="mic" aria-label="${t('lesson.mic')}">🎙️</button>
        <input class="inp" id="inp" dir="auto" placeholder="${esc(t('lesson.type'))}" enterkeyhint="send" autocomplete="off">
        <button class="tool" id="send" aria-label="${t('lesson.send')}">➤</button>
      </div>`;
    const el = (s) => $(s, root);
    const chatEl = el('#chat'), inp = el('#inp'), mic = el('#mic');
    const bubble = (cls, txt) => { const b = document.createElement('div'); b.className = 'bubble ' + cls; b.setAttribute('dir', 'auto'); b.textContent = txt; chatEl.appendChild(b); chatEl.scrollTop = chatEl.scrollHeight; return b; };
    const dots = () => { [...el('#dots').children].forEach((s, i) => { s.className = L.marks[i] || ''; }); };
    const syncMic = () => {
      mic.className = 'mic' + (L.listening ? ' on' : L.mode === 'text' ? ' off' : '');
      mic.disabled = L.busy;
      el('#mode').textContent = L.mode === 'voice' ? '⌨️' : '🎙️';
    };
    const stopListening = () => { L.listening = false; try { L.listener?.stop(); } catch { /* ignoré */ } };

    async function listenOnce() {
      if (L.aborted || L.busy || L.done || L.listening) return;
      if (!micAvailable()) { bubble('sys', t('lesson.nomic')); L.mode = 'text'; syncMic(); return; }
      L.listening = true; syncMic(); setMascot(root, 'listening');
      const h = listen({ lang: d.lang, onInterim: (x) => { inp.value = x; } });
      L.listener = h;
      try {
        const text = await h.promise;
        L.listening = false; syncMic();
        if (L.aborted) return;
        if (text) { inp.value = ''; await sendUser(text); }
        else { setMascot(root, 'idle'); bubble('sys', t('lesson.nospeech')); L.auto = false; }
      } catch (e) {
        L.listening = false; L.auto = false; syncMic(); setMascot(root, 'idle');
        bubble('sys', e.code === 'not-allowed' || e.code === 'service-not-allowed' ? t('lesson.micblocked') : e.code === 'network' ? t('lesson.micnet') : t('lesson.mictry'));
      }
    }

    async function nextTurn(text) {
      L.turns++;
      if (L.demo) return L.demo.next(text === START ? '' : text);
      L.msgs.push({ role: 'user', content: text });
      const raw = await chat({ system: tutorSystem(d), messages: L.msgs.slice(-14), maxTokens: 500 });
      L.msgs.push({ role: 'assistant', content: raw });
      return parseJSON(raw) || { say: raw, board: '', kind: 'explain', correct: null, done: false };
    }

    async function sendUser(text, { hidden = false } = {}) {
      if (L.aborted || L.busy || L.done) return;
      stopSpeaking(); stopListening();
      if (!hidden) bubble('me', text);
      L.busy = true; syncMic(); setMascot(root, 'thinking');
      let j;
      try { j = await nextTurn(text); }
      catch (e) {
        L.busy = false; syncMic(); setMascot(root, 'sad');
        bubble('sys', t(aiErrorKey(e)) + (e.message && e.code === 'http' ? ` (${e.message.slice(0, 80)})` : ''));
        return;
      }
      L.busy = false; syncMic();
      await show(j);
    }

    async function show(j) {
      if (L.aborted) return;
      if (typeof j.board === 'string') el('#board').textContent = j.board;
      bubble('bot', j.say || '');
      if (typeof j.correct === 'boolean' && (j.kind === 'feedback' || j.kind === 'summary')) {
        L.answered++; L.marks.push(j.correct ? 'ok' : 'bad'); dots();
        S.stats.questions++; if (j.correct) { L.right++; S.stats.right++; addXP(10); sfx('ok'); } else sfx('bad');
        save();
      }
      if (j.done || L.answered >= 4 || L.turns >= 14) L.done = true;
      setMascot(root, j.correct === true ? 'happy' : 'speaking');
      await speak(j.say || '', { lang: d.lang });
      if (L.aborted) return;
      setMascot(root, 'idle');
      if (L.done) return finish();
      if (L.mode === 'voice' && L.auto) setTimeout(listenOnce, 250);
    }

    function finish() {
      const stars = L.right >= 3 && L.hints === 0 ? 3 : L.right >= 2 ? 2 : 1;
      markDone(d.key, stars); S.stats.lessons++; save();
      const gain = 30 + stars * 10; addXP(gain);
      confetti(); sfx('win'); setMascot(root, 'happy');
      el('#dock').outerHTML = `<div class="dock" style="flex-direction:column;align-items:stretch">
        <div class="center"><div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div><div class="h2">${t('lesson.done', { xp: gain })}</div></div>
        ${d.next ? `<button class="btn block" id="nx">${t('lesson.next')}</button>` : ''}
        <button class="btn ${d.next ? 'ghost' : ''} block" id="bk">${t('lesson.back')}</button></div>`;
      const nx = el('#nx'); if (nx) nx.onclick = () => go(d.kind === 'academy' ? `#/lesson/academy/${d.next}?mode=${L.mode}` : `#/lesson/${d.subjectId}/${d.next}?mode=${L.mode}`);
      el('#bk').onclick = () => go(d.back);
    }

    el('#x').onclick = () => go(d.back);
    el('#mode').onclick = () => {
      if (L.mode === 'voice') { L.mode = 'text'; stopListening(); stopSpeaking(); syncMic(); setMascot(root, 'idle'); }
      else { L.mode = 'voice'; L.auto = true; unlockAudio(); syncMic(); listenOnce(); }
    };
    el('#hint').onclick = () => { if (L.busy || L.done || !L.turns) return; L.hints++; sendUser(t('lesson.hintmsg')); };
    mic.onclick = () => {
      if (L.busy || L.done) return;
      unlockAudio();
      if (L.listening) return stopListening();
      stopSpeaking(); L.mode = 'voice'; L.auto = true; listenOnce();
    };
    const submit = () => { const v = inp.value.trim(); if (!v) return; inp.value = ''; sendUser(v); };
    el('#send').onclick = submit;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    syncMic();
    sendUser(START, { hidden: true });
  },
  destroy() {
    if (cur) { cur.aborted = true; try { cur.listener?.stop(); } catch { /* ignoré */ } }
    stopSpeaking(); cur = null;
  },
};

/* ---------- quiz rapide / mini-bagrout ---------- */
const okQ = (x) => x && typeof x.q === 'string' && Array.isArray(x.options) && x.options.length >= 2 && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.options.length;
export const quiz = {
  async render(root, { args, q }) {
    const d = await describe(args, q);
    if (!d) { root.innerHTML = `<p class="center gap2">${t('lesson.notfound')}</p>`; return; }
    if (!spendEnergy()) { paywall(); history.back(); return; }
    root.innerHTML = `<div class="center gap2">${mascot('thinking', 110)}<p>${t('quiz.loading')}</p></div>`;
    let data = null;
    if (!aiReady()) data = demoQuiz(d);
    else {
      try {
        const raw = await chat({ system: quizSystem(d, 5), messages: [{ role: 'user', content: d.lang === 'en' ? 'Create the quiz.' : 'צרו את החידון.' }], maxTokens: 2200 });
        data = parseJSON(raw);
      } catch (e) { toast(t(aiErrorKey(e))); history.back(); return; }
    }
    const qs = (data?.questions || []).filter(okQ).slice(0, 5);
    if (qs.length < 3) { root.innerHTML = `<div class="card center gap2"><p>${t(aiReady() ? 'quiz.fail' : 'quiz.nodemo')}</p><button class="btn block gap" id="b">${t('back')}</button></div>`; $('#b', root).onclick = () => go(d.back); return; }
    const ltr = d.lang === 'en';
    let i = 0, right = 0;
    const draw = () => {
      const x = qs[i];
      root.innerHTML = `
        <div class="top"><button class="icon" id="x" aria-label="${t('close')}">✕</button><div class="grow"><div class="lvl"><i style="width:${(i / qs.length) * 100}%"></i></div></div><span class="pill">${i + 1}/${qs.length}</span></div>
        ${aiReady() ? '' : `<div class="warn small">${t('lesson.demo')}</div>`}
        <div class="card gap" dir="${ltr ? 'ltr' : 'auto'}"><div class="h2">${esc(x.q)}</div></div>
        <div id="opts" dir="${ltr ? 'ltr' : 'auto'}">${x.options.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join('')}</div>
        <div id="fb"></div>`;
      $('#x', root).onclick = () => go(d.back);
      $('#opts', root).onclick = (e) => {
        const b = e.target.closest('.opt'); if (!b || b.disabled) return;
        const k = Number(b.dataset.k), good = k === x.answer;
        [...$('#opts', root).children].forEach((c, n) => { c.disabled = true; if (n === x.answer) c.classList.add('good'); else if (n === k) c.classList.add('badc'); });
        if (good) { right++; sfx('ok'); } else sfx('bad');
        $('#fb', root).innerHTML = `${x.explain ? `<div class="explain" dir="${ltr ? 'ltr' : 'auto'}">${esc(x.explain)}</div>` : ''}<button class="btn block gap" id="nx">${i === qs.length - 1 ? t('quiz.finish') : t('quiz.next')}</button>`;
        $('#nx', root).onclick = () => { if (i === qs.length - 1) end(); else { i++; draw(); } };
      };
    };
    const end = () => {
      const stars = right >= 5 ? 3 : right >= 4 ? 2 : right >= 3 ? 1 : 0;
      S.stats.quizzes++; save();
      if (stars) markDone(d.key, stars);
      const gain = right * 8 + 10; addXP(gain);
      if (stars >= 2) { confetti(); sfx('win'); }
      root.innerHTML = `<div class="center gap2">${mascot(stars ? 'happy' : 'sad', 120)}<div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div><div class="h1">${right}/${qs.length}</div><p>${t('quiz.xp', { xp: gain })}</p>
        <button class="btn block gap" id="again">${t('quiz.again')}</button><button class="btn ghost block gap" id="bk">${t('lesson.back')}</button></div>`;
      $('#again', root).onclick = () => quiz.render(root, { args, q });
      $('#bk', root).onclick = () => go(d.back);
    };
    draw();
  },
};
