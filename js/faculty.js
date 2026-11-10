// Section faculté : données compilées dans data/faculty/index.json (voir scripts/build-faculty.mjs).
import { loadJSON } from './curriculum.js';

export const loadFaculty = () => loadJSON('faculty/index.json');
export function findCourse(fac, instId, courseId) {
  const inst = (fac?.institutions || []).find((i) => i.id === instId);
  const course = (inst?.courses || []).find((c) => c.id === courseId);
  return inst && course ? { inst, course } : null;
}
