// Accueil, apprentissage (lycée / faculté), profil, rapport pour les parents, première ouverture.
import { S, save } from '../store.js';
import { t, lang } from '../i18n.js';
import { $, esc, toast, mascot } from '../ui.js';
import { icon, tick } from '../icons.js';
import { SUBJECTS, loadSubject, unitsFor, progressOf, gradeText } from '../curriculum.js';
import { levelInfo, dailyInfo, openChest, energyLeft, FREE_ENERGY, BADGES } from '../game.js';
import { unlockAudio } from '../voice.js';
import { academyHome } from './academy.js';

const go = (h) => { location.hash = h; };
const fwd = icon('fwd', 'fwd');
const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
const seg = (items, cur, attr) => `<div class="seg">${items.map(([v, label]) => `<button class="${v === cur ? 'on' : ''}" data-${attr}="${v}" aria-pressed="${v === cur}">${label}</button>`).join('')}</div>`;
const trackSeg = (cur) => seg([['school', `${icon('school')}${esc(t('track.school'))}`], ['academy', `${icon('graduation-cap')}${esc(t('track.academy'))}`]], cur, 'tr');
const gradeSeg = (cur) => seg([10, 11, 12].map((g) => [g, gradeText(g)]), cur, 'g');
// Date du jour comme titre de l'accueil : « יום ראשון, 22 בנובמבר », « Dimanche 22 novembre ».
const todayTitle = () => { const s = new Intl.DateTimeFormat(lang() === 'fr' ? 'fr-FR' : 'he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()); return s.charAt(0).toUpperCase() + s.slice(1); };

// Liste des matières : icône, nom, niveaux, avancement.
async function subjectList() {
  const rows = await Promise.all(SUBJECTS.map(async (s) => {
    const data = await loadSubject(s.id);
    const units = unitsFor(s, data);
    const p = data ? progressOf(data, units, S.grade) : { pct: 0, done: 0, total: 0 };
    const levels = data ? t('subj.levels', { u: (data.levels || []).map((l) => l.units).sort().join(' · ') }) : t('subj.soon');
    return `<button class="item srow" data-s="${s.id}">${icon(s.icon, 'lead')}<span class="grow"><b>${esc(t('subj.' + s.id))}</b><span class="sub num">${esc(levels)}</span></span>${data && p.total ? `<span class="pr num"><span>${p.done}/${p.total}</span>${bar(p.pct, 'neutral')}</span>` : ''}${fwd}</button>`;
  }));
  return `<div class="group">${rows.join('')}</div>`;
}
const bindSubjects = (root) => root.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => go(`#/map/${b.dataset.s}`); });

export const welcome = {
  nonav: true,
  render(root) {
    let track = S.track, grade = S.grade;
    const draw = () => {
      root.innerHTML = `
        <div class="gap2">${mascot('happy', 72)}</div>
        <h1 class="title gap2">${t('wel.title')}</h1>
        <p class="muted gap">${t('wel.sub')}</p>
        <div class="field gap2"><label for="nm">${t('wel.name')}</label><input class="inp" id="nm" dir="auto" value="${esc(S.name)}" autocomplete="given-name"></div>
        <div class="field"><label>${t('wel.track')}</label>${trackSeg(track)}</div>
        ${track === 'school' ? `<div class="field"><label>${t('wel.grade')}</label>${gradeSeg(grade)}</div>` : ''}
        <button class="btn block gap2" id="go">${t('wel.go')}</button>
        <p class="small muted center gap">${t('wel.privacy')}</p>`;
      root.onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.tr) { S.name = $('#nm', root).value.trim(); track = b.dataset.tr; draw(); }
        if (b.dataset.g) { S.name = $('#nm', root).value.trim(); grade = Number(b.dataset.g); draw(); }
        if (b.id === 'go') { S.name = $('#nm', root).value.trim(); S.track = track; S.grade = grade; S.onboarded = true; save(); unlockAudio(); go('#/home'); }
      };
    };
    draw();
  },
};

export const home = {
  async render(root) {
    const li = levelInfo(), di = dailyInfo();
    const list = S.track === 'academy' ? '' : await subjectList();
    const energy = S.plan === 'pro' ? `<span title="${esc(t('home.pro'))}">${icon('infinity')}${esc(t('home.pro'))}</span>` : `<span title="${esc(t('home.energy'))}">${icon('heart')}${energyLeft()}/${FREE_ENERGY}</span>`;
    const reached = di.xp >= di.goal;
    root.innerHTML = `
      <header class="topbar"><div class="brand">${mascot('idle', 24)}${esc(t('app.name'))}</div>
        <div class="meta num"><span title="${esc(t('prof.streak'))}">${icon('flame')}${S.streak}</span><span title="${esc(t('home.xp'))}">${icon('zap')}${S.xp}</span><span title="${esc(t('prof.coins'))}">${icon('coins')}${S.coins}</span>${energy}</div></header>
      <h1 class="title gap">${esc(todayTitle())}</h1>
      <div class="level"><div class="lbl num"><span>${t('home.level', { n: li.level })}</span><span>${t('home.next', { n: li.toNext })}</span></div>${bar(li.pct, 'neutral')}</div>
      ${S.last
        ? `<section class="card resume"><div class="eyebrow">${t('home.resume')}</div><h2 class="h2" dir="auto">${esc(S.last.title)}</h2><div class="where" dir="auto">${esc(S.last.subject)}</div><button class="btn block" id="resume">${icon('play')}${t('home.resume.go')}</button></section>`
        : `<section class="card resume"><div class="eyebrow">${t('home.start.eyebrow')}</div><h2 class="h2">${t('home.start.title')}</h2><button class="btn block" id="start">${t('home.start.go')}</button></section>`}
      <section class="card goal gap"><div class="grow"><b>${t('home.daily')}</b><div class="fig num">${reached ? t('home.daily.done') : t('home.daily.fig', { xp: di.xp, goal: di.goal })}</div>${bar(di.pct)}</div>${reached ? tick() : ''}</section>
      ${di.chestReady ? `<button class="btn secondary block gap" id="chest">${icon('gift')}${t('home.chest')}</button>` : ''}
      <div class="quick gap">
        <button data-q="camera">${icon('camera')}${t('home.q.photo')}</button>
        <button data-q="call">${icon('mic')}${t('home.q.call')}</button>
        <button data-q="teachers">${icon('video')}${t('home.q.teacher')}</button>
      </div>
      ${S.track === 'academy'
        ? `<h2 class="sec-h sec">${t('track.academy')}</h2><div id="ah"></div>`
        : `<h2 class="sec-h sec">${t('home.subjects')}</h2>${list}`}`;
    bindSubjects(root);
    if (S.track === 'academy') academyHome($('#ah', root));
    const chest = $('#chest', root);
    if (chest) chest.onclick = () => { const n = openChest(); toast(t('home.chestgot', { n })); home.render(root); };
    const rs = $('#resume', root); if (rs) rs.onclick = () => { unlockAudio(); go(S.last.hash); };
    const st = $('#start', root); if (st) st.onclick = () => go('#/learn');
    root.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { unlockAudio(); go('#/' + b.dataset.q); }; });
  },
};

export const learn = {
  async render(root) {
    const draw = async () => {
      const list = S.track === 'school' ? await subjectList() : '';
      root.innerHTML = `
        <h1 class="h1">${t('nav.learn')}</h1>
        <div class="segs gap">${trackSeg(S.track)}${S.track === 'school' ? gradeSeg(S.grade) : ''}</div>
        <div class="gap2">${S.track === 'school' ? list : '<div id="ah"></div>'}</div>`;
      bindSubjects(root);
      if (S.track === 'academy') academyHome($('#ah', root));
      root.querySelectorAll('[data-tr]').forEach((b) => { b.onclick = () => { S.track = b.dataset.tr; save(); draw(); }; });
      root.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { S.grade = Number(b.dataset.g); save(); draw(); }; });
    };
    await draw();
  },
};

export const profile = {
  render(root) {
    const li = levelInfo();
    const acc = S.stats.questions ? Math.round((S.stats.right / S.stats.questions) * 100) : null;
    const name = S.name || t('prof.guest');
    const stat = (fig, label) => `<div class="stat"><div class="fig">${fig}</div><div class="lbl">${label}</div></div>`;
    const row = (go, ic, title, sub) => `<button class="item" data-go="${go}">${icon(ic, 'lead')}<span class="grow"><b>${title}</b><span class="sub">${sub}</span></span>${fwd}</button>`;
    root.innerHTML = `
      <div class="row gap"><div class="avatar lg" aria-hidden="true">${esc([...name][0] || '')}</div><div class="grow"><div class="h1" dir="auto">${esc(name)}</div><div class="small muted num">${t('home.level', { n: li.level })} · ${S.xp} ${t('home.xp')}</div></div></div>
      <div class="gap">${bar(li.pct, 'neutral')}</div>
      <div class="grid2 gap2">${stat(S.streak, t('prof.streak'))}${stat(S.coins, t('prof.coins'))}${stat(S.stats.lessons, t('prof.lessons'))}${stat(acc === null ? '—' : acc + '%', t('prof.accuracy'))}</div>
      <div class="sec"><h3>${t('prof.badges')}</h3><div class="badges">${BADGES.map((b) => { const on = S.badges.includes(b.id); return `<div class="badge ${on ? 'on' : ''}"><span class="disc">${icon(b.icon)}</span>${esc(t('badge.' + b.id))}${on ? `<span class="sr">${t('prof.badge.got')}</span>` : ''}</div>`; }).join('')}</div></div>
      <div class="sec card"><h3 class="h2">${S.plan === 'pro' ? t('prof.plan.pro') : t('prof.plan.free')}</h3><p class="small muted gap">${S.plan === 'pro' ? t('prof.plan.prosub') : t('prof.plan.freesub', { n: FREE_ENERGY })}</p><div class="warn gap">${icon('info')}<span>${t('pay.demo')}</span></div>
        <button class="btn ${S.plan === 'pro' ? 'quiet' : ''} block gap" id="plan">${S.plan === 'pro' ? t('prof.plan.off') : t('prof.plan.on')}</button></div>
      <div class="group sec">
        ${row('parent', 'users', t('prof.parent'), t('prof.parentsub'))}
        ${row('teachers', 'video', t('home.q.teacher'), t('teach.sub', { price: 80 }))}
        ${row('settings', 'settings', t('prof.settings'), t('prof.settingssub'))}
      </div>`;
    root.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go('#/' + b.dataset.go); });
    $('#plan', root).onclick = () => { S.plan = S.plan === 'pro' ? 'free' : 'pro'; save(); toast(t(S.plan === 'pro' ? 'pay.on' : 'pay.off')); profile.render(root); };
  },
};

export const parent = {
  async render(root) {
    const mins = S.stats.lessons * 8 + S.stats.quizzes * 4 + S.stats.calls * 6 + S.stats.photos * 3;
    const acc = S.stats.questions ? Math.round((S.stats.right / S.stats.questions) * 100) : null;
    const bySubject = {};
    Object.entries(S.done).forEach(([id, d]) => { const k = id.split(/[-:]/)[0]; if (k && k !== 'boss' && k !== 'acad') bySubject[k] = (bySubject[k] || 0) + 1; });
    const subjects = Object.entries(bySubject).sort((a, b) => b[1] - a[1]);
    const strong = subjects[0]?.[0];
    const weak = SUBJECTS.map((s) => s.id).filter((id) => !bySubject[id])[0];
    const text = t('parent.share', { name: S.name || t('prof.guest'), lessons: S.stats.lessons, q: S.stats.questions, acc: acc === null ? '—' : acc, streak: S.streak, mins });
    root.innerHTML = `
      <div class="top"><button class="icon" id="bk" aria-label="${t('back')}">${icon('back')}</button><h1 class="h1">${t('parent.title')}</h1></div>
      <div class="warn">${icon('info')}<span>${t('parent.note')}</span></div>
      <div class="card gap"><div class="kv"><span>${t('parent.time')}</span><b>≈ ${mins} ${t('teach.min')}</b></div><div class="kv"><span>${t('prof.lessons')}</span><b>${S.stats.lessons}</b></div><div class="kv"><span>${t('parent.questions')}</span><b>${S.stats.questions}</b></div><div class="kv"><span>${t('prof.accuracy')}</span><b>${acc === null ? '—' : acc + '%'}</b></div><div class="kv"><span>${t('prof.streak')}</span><b>${S.streak}</b></div></div>
      <div class="card gap">${strong ? `<p class="row">${icon('trending-up', 'lead')}<span>${t('parent.strong', { s: esc(t('subj.' + strong)) })}</span></p>` : ''}${weak ? `<p class="row${strong ? ' gap' : ''}">${icon('target', 'lead')}<span>${t('parent.weak', { s: esc(t('subj.' + weak)) })}</span></p>` : ''}${!strong ? `<p class="muted gap">${t('parent.none')}</p>` : ''}</div>
      <button class="btn block gap2" id="wa">${icon('share-2')}${t('parent.share.btn')}</button>`;
    $('#bk', root).onclick = () => go('#/profile');
    $('#wa', root).onclick = async () => {
      if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* annulé */ } }
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    };
  },
};
