// Construit data/index.json (sommaire des matières) et data/faculty/index.json (comparaison des établissements).
// À lancer après chaque mise à jour des programmes : node scripts/build-data.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const curDir = `${root}/data/curriculum`;
const facDir = `${root}/data/faculty`;
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 1)); };

// --- matières du lycée
const files = fs.readdirSync(curDir).filter((f) => f.endsWith('.json') && f !== 'index.json');
const subjects = [], problems = [];
for (const f of files) {
  const d = read(`${curDir}/${f}`);
  const levels = d.levels || [];
  const topics = levels.reduce((n, l) => n + (l.grades || []).reduce((m, g) => m + (g.topics || []).length, 0), 0);
  if (!d.id) { problems.push(`${f}: id manquant`); continue; }
  const units = [...new Set(levels.map((l) => Number(l.units)).filter((u) => u > 0))].sort((a, b) => a - b);
  subjects.push({
    id: d.id, name: d.name, status: d.status || 'draft',
    schoolYear: d.schoolYear || null, units, levels: levels.length, topics,
    retrievedAt: d.retrievedAt || null,
    unverified: Array.isArray(d.unverified) ? d.unverified.length : 0
  });
}
subjects.sort((a, b) => (b.topics || 0) - (a.topics || 0));
const index = {
  generatedAt: new Date().toISOString(),
  schoolYear: subjects.find((s) => s.schoolYear)?.schoolYear || null,
  status: 'draft',
  subjects,
  totals: { subjects: subjects.length, topics: subjects.reduce((n, s) => n + (s.topics || 0), 0), units: [...new Set(subjects.flatMap((s) => s.units))].sort((a, b) => a - b) }
};
write(`${curDir}/index.json`, index);

// --- faculté
const raw = `${facDir}/raw`;
const institutions = [];
if (fs.existsSync(raw)) {
  for (const f of fs.readdirSync(raw).filter((x) => x.endsWith('.json'))) {
    try {
      const d = read(`${raw}/${f}`);
      let inst = d.institutions ? d.institutions : (d.id ? [d] : null);
      if (!inst) { problems.push(`${f}: ni id ni institutions`); continue; }
      for (const i of inst) {
        // L'Université ouverte publie ses cours dans « foundationCourses », les autres dans « courses ».
        if (!i.courses && Array.isArray(i.foundationCourses)) i.courses = i.foundationCourses;
        institutions.push(i);
      }
    } catch (e) { problems.push(`${f}: illisible (${e.message})`); }
  }
}
// Regroupe les cours par « famille » (même cours de première année dans plusieurs établissements).
const byFamily = new Map();
for (const i of institutions) {
  for (const c of i.courses || []) {
    const fam = c.family || `course:${i.id}:${c.code || c.id}`;
    if (!byFamily.has(fam)) byFamily.set(fam, { family: fam, he: c.he, fr: c.fr, offers: [] });
    byFamily.get(fam).offers.push({ inst: i.id, course: c.id });
  }
}
// L'index ne garde que l'essentiel : les thèmes complets restent dans data/faculty/raw/*.json.
const families = [...byFamily.values()].filter((f) => f.offers.length >= 1);
const slim = (c) => ({ id: c.id, family: c.family, he: c.he, fr: c.fr, code: c.code, credits: c.credits });
const faculty = {
  generatedAt: new Date().toISOString(),
  status: 'draft',
  institutions: institutions.map((i) => ({
    id: i.id, name: i.name, website: i.website, status: i.status, retrievedAt: i.retrievedAt,
    notes: undefined, unverified: undefined, foundationCourses: undefined,
    faculties: i.faculties, courses: (i.courses || []).map(slim)
  })),
  families,
  totals: { institutions: institutions.length, courses: institutions.reduce((n, i) => n + (i.courses || []).length, 0), families: families.length }
};
write(`${facDir}/index.json`, faculty);

console.log(`matières : ${subjects.length}, sujets : ${index.totals.topics}, niveaux d'unités : ${index.totals.units.join(', ')}`);
console.log(`faculté : ${faculty.totals.institutions} établissements, ${faculty.totals.courses} cours`);
if (problems.length) console.log('attention :', problems.join(' | '));
