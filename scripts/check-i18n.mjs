// Vérifie que toutes les clés de texte utilisées dans le code existent dans chaque langue.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = [...fs.readdirSync(`${root}/js`).filter((f) => f.endsWith('.js')).map((f) => `${root}/js/${f}`), ...fs.readdirSync(`${root}/js/views`).map((f) => `${root}/js/views/${f}`)];
const re = /['"`]((?:nav|track|subj|wel|home|game|badge|pay|map|lesson|quiz|cam|call|acad|teach|prof|parent|set|err)\.[a-zA-Z0-9_.]+|back|close|units|grade)['"`]/g;
const used = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(re)) used.add(m[1]);
const langs = Object.fromEntries(fs.readdirSync(`${root}/i18n`).map((f) => [f.replace('.json', ''), JSON.parse(fs.readFileSync(`${root}/i18n/${f}`, 'utf8'))]));
let bad = 0;
for (const [l, d] of Object.entries(langs)) {
  const missing = [...used].filter((k) => !(k in d) && !k.endsWith('.'));
  if (missing.length) { bad++; console.log(`[${l}] clés manquantes :`, missing.join(', ')); }
}
const he = Object.keys(langs.he);
for (const [l, d] of Object.entries(langs)) {
  const diff = he.filter((k) => !(k in d));
  if (diff.length) { bad++; console.log(`[${l}] absentes par rapport à l'hébreu :`, diff.join(', ')); }
}
console.log(`${used.size} clés utilisées, langues : ${Object.keys(langs).join(', ')} — ${bad ? 'PROBLÈMES' : 'tout est cohérent'}`);
process.exit(bad ? 1 : 0);
