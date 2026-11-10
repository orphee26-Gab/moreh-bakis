// Textes de l'interface : un fichier par langue (i18n/he.json, i18n/fr.json...). L'hébreu sert de base.
let base = {}, dict = {}, cur = 'he';
async function get(l) {
  try { const r = await fetch(`i18n/${l}.json`, { cache: 'no-cache' }); return r.ok ? await r.json() : {}; } catch { return {}; }
}
export async function loadLang(l) {
  base = await get('he');
  dict = l === 'he' ? base : await get(l);
  cur = l;
  document.documentElement.lang = l;
  document.documentElement.dir = ['he', 'ar'].includes(l) ? 'rtl' : 'ltr';
}
export const lang = () => cur;
export function t(key, vars = {}) {
  const s = dict[key] ?? base[key] ?? key;
  return String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
