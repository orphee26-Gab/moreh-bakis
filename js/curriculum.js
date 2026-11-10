// Programmes du lycée (data/curriculum/*.json) : chargement et sélection des thèmes.
import { S } from './store.js';
import { t, lang } from './i18n.js';

export const DATA_BASE = new URLSearchParams(location.search).get('data') || 'data';
export const SUBJECTS = [
  { id: 'math', icon: '➗', color: '#5cc8ff', units: [3, 4, 5] },
  { id: 'geometry', icon: '📐', color: '#8f84ff', units: [3, 4, 5] },
  { id: 'english', icon: '🗣️', color: '#4fd6a6', units: [3, 4, 5], lang: 'en' },
  { id: 'physics', icon: '⚛️', color: '#ffc95a', units: [5] },
  { id: 'history', icon: '🏛️', color: '#ff7b8f', units: [2] },
  { id: 'tanakh', icon: '📖', color: '#c59bff', units: [2] },
  { id: 'hebrew', icon: '✍️', color: '#ff9f5c', units: [2] },
];
export const subjectMeta = (id) => SUBJECTS.find((s) => s.id === id);

const cache = new Map();
export function loadJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(`${DATA_BASE}/${path}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(path);
}
// Niveaux lus dans les documents du ministère mais PAS confirmés comme niveaux d'enseignement :
//  - hébreu 5 : seulement le « travail de fin d'études » (code 11279), pas un cours de 5 יחידות ;
//  - physique 1 : « introduction aux sciences », autre programme que la physique du bagrout.
// À retirer de cette liste dès que Gabriel confirme ces niveaux.
const HIDDEN_LEVELS = { hebrew: [5], physics: [1] };
export const loadSubject = (id) => loadJSON(`curriculum/${id}.json`).then((d) => {
  const hide = HIDDEN_LEVELS[id];
  return d && hide ? { ...d, levels: (d.levels || []).filter((l) => !hide.includes(Number(l.units))) } : d;
});

export const tr = (o) => (S.lang === 'fr' ? (o?.fr || o?.he) : (o?.he || o?.fr)) || '';

export function unitsAvailable(meta, data) {
  const u = (data?.levels || []).map((l) => Number(l.units)).filter(Boolean);
  return u.length ? [...new Set(u)].sort((a, b) => a - b) : meta.units;
}
export function defaultUnits(meta, data) {
  const av = unitsAvailable(meta, data);
  return av.includes(4) ? 4 : av[av.length - 1];
}
export function unitsFor(meta, data) {
  const av = unitsAvailable(meta, data);
  const saved = S.units[meta.id];
  return av.includes(saved) ? saved : defaultUnits(meta, data);
}

// Thèmes d'un niveau et d'une classe : classe exacte, sinon « all », sinon toutes les classes réunies.
export function topicsFor(data, units, grade) {
  const lvl = (data?.levels || []).find((l) => Number(l.units) === Number(units));
  if (!lvl) return { topics: [], approx: false };
  const g = String(grade);
  const exact = (lvl.grades || []).find((x) => String(x.grade) === g);
  if (exact?.topics?.length) return { topics: exact.topics, approx: false };
  const all = (lvl.grades || []).find((x) => String(x.grade) === 'all');
  if (all?.topics?.length) return { topics: all.topics, approx: false };
  const merged = (lvl.grades || []).flatMap((x) => x.topics || []);
  return { topics: merged, approx: merged.length > 0 };
}
export function findTopic(data, id) {
  for (const l of data?.levels || []) for (const g of l.grades || []) for (const tp of g.topics || []) {
    if (tp.id === id) return { topic: tp, units: Number(l.units), grade: g.grade };
  }
  return null;
}
export function progressOf(data, units, grade) {
  const { topics } = topicsFor(data, units, grade);
  const done = topics.filter((x) => S.done[x.id]).length;
  return { done, total: topics.length, pct: topics.length ? Math.round((done / topics.length) * 100) : 0 };
}
export const gradeLabel = (g) => ({ 10: "י'", 11: 'י"א', 12: 'י"ב' }[Number(g)] || String(g));
// Texte affiché pour une classe : « כיתה י"א » en hébreu, « Première (י"א) » en français.
export function gradeText(g) {
  const n = Number(g), key = `grade.n${n}`, word = t(key);
  return lang() === 'he' || word === key ? `${t('grade')} ${gradeLabel(n)}` : `${word} (<bdi dir="rtl">${gradeLabel(n)}</bdi>)`;
}
