// Section faculté : liste dans data/faculty/index.json, détails dans data/faculty/raw/<établissement>.json.
import { loadJSON } from './curriculum.js';

export const loadFaculty = () => loadJSON('faculty/index.json');
// Unité du champ « credits » : elle diffère selon l'établissement (voir les notes de data/faculty/raw/*.json).
//  Technion et Université ouverte : נ"ז ; Tel-Aviv : ש"ס (heures hebdomadaires cours + TD) ;
//  Bar-Ilan : indiquée cours par cours dans « creditsUnit ».
const KIND_BY_INST = { technion: 'points', openu: 'points', tau: 'hours', biu: 'points' };
export function creditsKind(instId, course) {
  const u = course?.creditsUnit;
  if (u) return /נקודות/.test(u) ? 'points' : 'hours';
  return KIND_BY_INST[instId] || 'points';
}
export const loadInstitution = (id) => loadJSON(`faculty/raw/${id}.json`);

export async function findCourse(fac, instId, courseId) {
  const inst = (fac?.institutions || []).find((i) => i.id === instId);
  const light = (inst?.courses || []).find((c) => c.id === courseId);
  if (!inst || !light) return null;
  // l'index est volontairement léger : les thèmes complets sont dans le fichier de l'établissement
  try {
    const full = await loadInstitution(instId);
    const course = (full.courses || full.foundationCourses || []).find((c) => c.id === courseId) || light;
    return { inst: full, course };
  } catch {
    return { inst, course: light };
  }
}
