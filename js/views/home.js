// Accueil, apprentissage (lycée / faculté), profil, rapport pour les parents, première ouverture.
import { S, save } from '../store.js';
import { t } from '../i18n.js';
import { $, esc, toast, modal, mascot, ring, confetti, sfx } from '../ui.js';
import { SUBJECTS, loadSubject, unitsFor, progressOf, gradeLabel } from '../curriculum.js';
import { levelInfo, dailyInfo, openChest, energyLeft, FREE_ENERGY, BADGES, addXP } from '../game.js';
import { unlockAudio } from '../voice.js';
import { academyHome } from './academy.js';

const go = (h) => { location.hash = h; };

async function subjectGrid() {
  const cards = await Promise.all(SUBJECTS.map(async (s) => {
    const data = await loadSubject(s.id);
    const units = unitsFor(s, data);
    const p = data ? progressOf(data, units, S.grade) : { pct: 0 };
    return `<button class="subj" style="--c:${s.color}" data-s="${s.id}"><div class="em">${s.icon}</div><div class="nm">${esc(t('subj.' + s.id))}</div><div class="small muted">${data ? esc(t('subj.levels', { u: (data.levels || []).map((l) => l.units).sort().join(' · ') })) : esc(t('subj.soon'))}</div><div class="bar"><i style="width:${p.pct}%"></i></div></button>`;
  }));
  return `<div class="grid2">${cards.join('')}</div>`;
}
const bindGrid = (root) => root.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => go(`#/map/${b.dataset.s}`); });
const energyPill = () => (S.plan === 'pro' ? `<span class="pill">∞ ${t('home.pro')}</span>` : `<span class="pill">❤️ ${energyLeft()}/${FREE_ENERGY}</span>`);

export const welcome = {
  nonav: true,
  render(root) {
    let track = S.track, grade = S.grade;
    const draw = () => {
      root.innerHTML = `
        <div class="center gap2">${mascot('happy', 150)}<h1 class="h1 gap">${t('wel.title')}</h1><p class="muted">${t('wel.sub')}</p></div>
        <div class="field gap"><label>${t('wel.name')}</label><input class="inp" id="nm" dir="auto" value="${esc(S.name)}" autocomplete="given-name"></div>
        <div class="field"><label>${t('wel.track')}</label><div class="chips"><button class="chip ${track === 'school' ? 'on' : ''}" data-tr="school">🏫 ${t('track.school')}</button><button class="chip ${track === 'academy' ? 'on' : ''}" data-tr="academy">🎓 ${t('track.academy')}</button></div></div>
        ${track === 'school' ? `<div class="field"><label>${t('wel.grade')}</label><div class="chips">${[10, 11, 12].map((g) => `<button class="chip ${g === grade ? 'on' : ''}" data-g="${g}">${t('grade')} ${gradeLabel(g)}</button>`).join('')}</div></div>` : ''}
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
    const grid = await subjectGrid();
    root.innerHTML = `
      <div class="hero">${mascot('idle', 84)}<div class="grow"><div class="hello">${t('home.hello', { name: S.name ? ' ' + esc(S.name) : '' })}</div><div class="muted small">${t('home.level', { n: li.level })} · ${t('home.next', { n: li.toNext })}</div><div class="lvl" style="margin-top:6px"><i style="width:${li.pct}%"></i></div></div></div>
      <div class="stats"><span class="pill">🔥 ${S.streak}</span><span class="pill">⚡ ${S.xp}</span><span class="pill">🪙 ${S.coins}</span>${energyPill()}</div>
      <div class="card row">${ring(di.pct, `${di.xp}/${di.goal}`)}<div class="grow"><b>${t('home.daily')}</b><div class="small muted">${t('home.dailysub')}</div>${di.chestReady ? `<button class="btn sun sm gap" id="chest">🎁 ${t('home.chest')}</button>` : ''}</div></div>
      ${S.last ? `<button class="item gap" id="resume"><span class="em">▶️</span><div class="grow"><b>${t('home.resume')}</b><div class="small muted" dir="auto">${esc(S.last.subject)} · ${esc(S.last.title)}</div></div></button>` : ''}
      <div class="quick gap2">
        <button data-q="camera"><span>📷</span>${t('home.q.photo')}</button>
        <button data-q="call"><span>🎙️</span>${t('home.q.call')}</button>
        <button data-q="teachers"><span>👩‍🏫</span>${t('home.q.teacher')}</button>
      </div>
      ${S.track === 'academy'
        ? `<h2 class="h2 gap2">${t('track.academy')}</h2><div id="ah" class="gap"></div>`
        : `<h2 class="h2 gap2">${t('home.subjects')}</h2><div class="gap">${grid}</div>`}`;
    bindGrid(root);
    if (S.track === 'academy') academyHome($('#ah', root));
    const chest = $('#chest', root);
    if (chest) chest.onclick = () => { const n = openChest(); toast(t('home.chestgot', { n })); home.render(root); };
    const rs = $('#resume', root); if (rs) rs.onclick = () => { unlockAudio(); go(S.last.hash); };
    root.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { unlockAudio(); go('#/' + b.dataset.q); }; });
  },
};

export const learn = {
  async render(root) {
    const draw = async () => {
      const grid = S.track === 'school' ? await subjectGrid() : '';
      root.innerHTML = `
        <h1 class="h1">${t('nav.learn')}</h1>
        <div class="chips"><button class="chip ${S.track === 'school' ? 'on' : ''}" data-tr="school">🏫 ${t('track.school')}</button><button class="chip ${S.track === 'academy' ? 'on' : ''}" data-tr="academy">🎓 ${t('track.academy')}</button></div>
        ${S.track === 'school'
          ? `<div class="chips">${[10, 11, 12].map((g) => `<button class="chip ${g === S.grade ? 'on' : ''}" data-g="${g}">${t('grade')} ${gradeLabel(g)}</button>`).join('')}</div><div class="gap">${grid}</div>`
          : '<div id="ah" class="gap"></div>'}`;
      bindGrid(root);
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
    root.innerHTML = `
      <div class="hero">${mascot('happy', 84)}<div class="grow"><div class="hello" dir="auto">${esc(S.name || t('prof.guest'))}</div><div class="muted small">${t('home.level', { n: li.level })} · ${S.xp} XP</div><div class="lvl" style="margin-top:6px"><i style="width:${li.pct}%"></i></div></div></div>
      <div class="grid2 gap">
        <div class="card center"><div class="h1">🔥 ${S.streak}</div><div class="small muted">${t('prof.streak')}</div></div>
        <div class="card center"><div class="h1">🪙 ${S.coins}</div><div class="small muted">${t('prof.coins')}</div></div>
        <div class="card center"><div class="h1">${S.stats.lessons}</div><div class="small muted">${t('prof.lessons')}</div></div>
        <div class="card center"><div class="h1">${acc === null ? '—' : acc + '%'}</div><div class="small muted">${t('prof.accuracy')}</div></div>
      </div>
      <div class="sec"><h3>${t('prof.badges')}</h3><div class="grid2" style="grid-template-columns:repeat(3,1fr)">${BADGES.map((b) => `<div class="badge ${S.badges.includes(b.id) ? 'on' : ''}"><span>${b.icon}</span>${esc(t('badge.' + b.id))}</div>`).join('')}</div></div>
      <div class="sec card"><h3>${S.plan === 'pro' ? t('prof.plan.pro') : t('prof.plan.free')}</h3><p class="small muted">${S.plan === 'pro' ? t('prof.plan.prosub') : t('prof.plan.freesub', { n: FREE_ENERGY })}</p><div class="warn small">${t('pay.demo')}</div>
        <button class="btn ${S.plan === 'pro' ? 'ghost' : 'sun'} block gap" id="plan">${S.plan === 'pro' ? t('prof.plan.off') : t('prof.plan.on')}</button></div>
      <div class="list sec">
        <button class="item" data-go="parent"><span class="em">👨‍👩‍👧</span><div class="grow"><b>${t('prof.parent')}</b><div class="small muted">${t('prof.parentsub')}</div></div></button>
        <button class="item" data-go="teachers"><span class="em">👩‍🏫</span><div class="grow"><b>${t('home.q.teacher')}</b><div class="small muted">${t('teach.sub', { price: 80 })}</div></div></button>
        <button class="item" data-go="settings"><span class="em">⚙️</span><div class="grow"><b>${t('prof.settings')}</b><div class="small muted">${t('prof.settingssub')}</div></div></button>
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
      <div class="top"><button class="icon" id="bk" aria-label="${t('back')}"><span class="arr">→</span></button><h1 class="h1 grow">${t('parent.title')}</h1></div>
      <div class="warn small">${t('parent.note')}</div>
      <div class="card gap"><div class="kv"><span>${t('parent.time')}</span><b>≈ ${mins} ${t('teach.min')}</b></div><div class="kv"><span>${t('prof.lessons')}</span><b>${S.stats.lessons}</b></div><div class="kv"><span>${t('parent.questions')}</span><b>${S.stats.questions}</b></div><div class="kv"><span>${t('prof.accuracy')}</span><b>${acc === null ? '—' : acc + '%'}</b></div><div class="kv"><span>${t('prof.streak')}</span><b>${S.streak}</b></div></div>
      <div class="card gap">${strong ? `<p>💪 ${t('parent.strong', { s: esc(t('subj.' + strong)) })}</p>` : ''}${weak ? `<p>🎯 ${t('parent.weak', { s: esc(t('subj.' + weak)) })}</p>` : ''}${!strong ? `<p class="muted">${t('parent.none')}</p>` : ''}</div>
      <button class="btn block gap2" id="wa">${t('parent.share.btn')}</button>`;
    $('#bk', root).onclick = () => go('#/profile');
    $('#wa', root).onclick = async () => {
      if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* annulé */ } }
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    };
  },
};
