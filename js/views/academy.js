// Section faculté : établissements, facultés, cours fondamentaux de première année, comparaison entre établissements.
import { S } from '../store.js';
import { t } from '../i18n.js';
import { $, esc } from '../ui.js';
import { tr } from '../curriculum.js';
import { loadFaculty, findCourse } from '../faculty.js';
import { unlockAudio } from '../voice.js';

const go = (h) => { location.hash = h; };
const MATCH = { high: 'ok', medium: 'warn', low: 'warn', unknown: 'warn' };
const famName = (fac, slug) => { const f = (fac.families || []).find((x) => x.family === slug); return f ? tr(f) || slug : slug.replace(/^other-/, '').replace(/-/g, ' '); };
const nm = (o) => (o?.name ? (S.lang === 'fr' ? o.name.fr || o.name.he : o.name.he || o.name.fr) : tr(o));

// Contenu de l'onglet « Faculté » (réutilisé par l'écran Apprendre).
export async function academyHome(root) {
  const fac = await loadFaculty();
  if (!fac?.institutions?.length) { root.innerHTML = `<div class="card center gap"><p>${t('acad.empty')}</p></div>`; return; }
  root.innerHTML = `
    <div class="warn small">${t('acad.draft')}</div>
    <div class="list gap">${fac.institutions.map((i) => `<button class="item" data-inst="${esc(i.id)}"><span class="em">🎓</span><div class="grow"><b>${esc(nm(i))}</b><div class="small muted">${t('acad.counts', { f: (i.faculties || []).length, c: (i.courses || []).length })}</div></div></button>`).join('')}</div>
    ${(fac.families || []).length ? `<button class="btn violet block gap2" id="fams">🔍 ${t('acad.compare')}</button>` : ''}
    <p class="small muted gap2">${t('acad.disclaimer')}</p>`;
  root.querySelectorAll('[data-inst]').forEach((b) => { b.onclick = () => go(`#/academy/inst/${b.dataset.inst}`); });
  const fb = $('#fams', root); if (fb) fb.onclick = () => go('#/academy/families');
}

export const academy = {
  async render(root, { args }) {
    const fac = await loadFaculty();
    const [sub, a, b] = args;
    const top = (title, back) => `<div class="top"><button class="icon" id="bk" aria-label="${t('back')}"><span class="arr">→</span></button><h1 class="h1 grow" dir="auto">${esc(title)}</h1></div>`;
    const bindBack = (h) => { const x = $('#bk', root); if (x) x.onclick = () => (h ? go(h) : history.back()); };
    if (!fac?.institutions?.length) { root.innerHTML = top(t('acad.title')) + `<div class="card center"><p>${t('acad.empty')}</p></div>`; bindBack('#/learn'); return; }

    if (sub === 'inst') {
      const inst = fac.institutions.find((i) => i.id === a);
      if (!inst) return go('#/learn');
      const byFam = {};
      (inst.courses || []).forEach((c) => { (byFam[c.family || 'other'] ||= []).push(c); });
      root.innerHTML = top(nm(inst)) + `
        <div class="warn small">${t('acad.draft')}</div>
        ${inst.website ? `<p class="small"><a href="${esc(inst.website)}" target="_blank" rel="noopener" style="color:var(--sky)">${esc(inst.website)}</a></p>` : ''}
        <h2 class="h2 gap">${t('acad.courses')}</h2>
        ${Object.entries(byFam).map(([fam, cs]) => `<h3 class="small muted gap" dir="auto">${esc(famName(fac, fam))}</h3><div class="list">${cs.map((c) => `<button class="item" data-c="${esc(c.id)}"><span class="em">📘</span><div class="grow"><b dir="auto">${esc(c.he || tr(c))}</b><div class="small muted">${c.code ? esc(c.code) + ' · ' : ''}${c.credits != null ? esc(String(c.credits)) + ' ' + t('acad.credits') : ''}</div></div></button>`).join('')}</div>`).join('')}
        <h2 class="h2 gap2">${t('acad.faculties')}</h2>
        <div class="list">${(inst.faculties || []).map((f) => `<div class="card flat" dir="auto"><b>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener" style="color:var(--ink)">${esc(f.he || tr(f))}</a>` : esc(f.he || tr(f))}</b>${S.lang === 'fr' && f.fr ? `<div class="small muted">${esc(f.fr)}</div>` : ''}${(f.mainDegrees || []).length ? `<div class="small muted">${f.mainDegrees.slice(0, 4).map((d) => esc(d.he || tr(d))).join(' · ')}</div>` : ''}</div>`).join('')}</div>`;
      bindBack('#/learn');
      root.querySelectorAll('[data-c]').forEach((x) => { x.onclick = () => go(`#/academy/course/${inst.id}/${x.dataset.c}`); });
      return;
    }

    if (sub === 'course') {
      const found = await findCourse(fac, a, b);
      if (!found) return go('#/learn');
      const inst = found.inst, c = found.course;
      const base = `${inst.id}/${c.id}`;
      root.innerHTML = top(c.he || tr(c)) + `
        <div class="muted small">${esc(nm(inst))}${c.code ? ' · ' + esc(c.code) : ''}${c.credits != null ? ' · ' + esc(String(c.credits)) + ' ' + t('acad.credits') : ''}</div>
        <div class="warn small gap">${t('acad.draft')}</div>
        ${(c.prerequisites || []).length ? `<p class="small muted gap" dir="auto">${t('acad.prereq')}: ${c.prerequisites.map(esc).join(' · ')}</p>` : ''}
        <h2 class="h2 gap">${t('acad.topics')}</h2>
        <div class="list">${(c.topics || []).map((tp, i) => `<div class="item"><b class="grow" dir="auto">${esc(tp.he || tr(tp))}</b><button class="btn sm" data-v="${i}" aria-label="${t('map.voice')}">🎙️</button><button class="btn violet sm" data-w="${i}" aria-label="${t('map.text')}">⌨️</button></div>`).join('') || `<p class="muted">${t('acad.notopics')}</p>`}</div>
        <button class="btn sun block gap2" id="q">🧩 ${t('acad.quiz')}</button>
        ${c.source ? `<p class="small gap"><a href="${esc(c.source)}" target="_blank" rel="noopener" style="color:var(--sky)">${t('acad.source')}</a></p>` : ''}`;
      bindBack(`#/academy/inst/${inst.id}`);
      root.querySelectorAll('[data-v]').forEach((x) => { x.onclick = () => { unlockAudio(); go(`#/lesson/academy/${base}/${x.dataset.v}?mode=voice`); }; });
      root.querySelectorAll('[data-w]').forEach((x) => { x.onclick = () => go(`#/lesson/academy/${base}/${x.dataset.w}?mode=text`); });
      $('#q', root).onclick = () => go(`#/quiz/academy/${base}/all`);
      return;
    }

    if (sub === 'families') {
      const fams = fac.families || [];
      const label = { high: t('acad.match.high'), medium: t('acad.match.medium'), low: t('acad.match.low'), unknown: t('acad.match.unknown') };
      root.innerHTML = top(t('acad.compare')) + `
        <p class="muted small">${t('acad.compare.sub')}</p>
        <div class="list gap">${fams.map((f) => `<div class="card fam" dir="auto"><b>${esc(tr(f) || f.family)}</b> <span class="tag">${esc(label[f.match] || label.unknown)}</span>
          <div class="chips">${(f.offers || []).map((o) => { const i = fac.institutions.find((x) => x.id === o.inst); const c = i?.courses?.find((x) => x.id === o.course); return `<button class="chip" data-i="${esc(o.inst)}" data-c="${esc(o.course)}">${esc(nm(i) || o.inst)}${c?.code ? ' · ' + esc(c.code) : ''}</button>`; }).join('')}</div>
          ${f.note ? `<div class="small muted">${esc(f.note)}</div>` : ''}</div>`).join('')}</div>`;
      bindBack('#/learn');
      root.querySelectorAll('.chip[data-c]').forEach((x) => { x.onclick = () => go(`#/academy/course/${x.dataset.i}/${x.dataset.c}`); });
      return;
    }
    root.innerHTML = top(t('acad.title')) + '<div id="ah"></div>';
    bindBack('#/learn');
    academyHome($('#ah', root));
  },
};
