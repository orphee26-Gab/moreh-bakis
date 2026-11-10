// État de l'application, enregistré dans le navigateur de l'élève (localStorage).
const KEY = 'mb.v1';
const DEFAULT = {
  v: 1, lang: 'he', onboarded: false, name: '', track: 'school', grade: 11,
  plan: 'free', xp: 0, coins: 0, streak: 0, best: 0, lastActive: '',
  daily: { date: '', xp: 0, goal: 60, chest: false },
  energy: { date: '', used: 0 },
  badges: [], done: {}, units: {}, last: null,
  stats: { lessons: 0, questions: 0, right: 0, photos: 0, calls: 0, quizzes: 0 },
  prefs: { sound: true },
  ai: { mode: 'demo', key: '', proxyUrl: '', model: 'claude-haiku-4-5', visionModel: 'claude-sonnet-4-6' },
  voice: { engine: 'device', deviceVoice: '', rate: 1, sttEngine: 'device', eleven: { key: '', voiceId: '', voiceName: '', modelHe: 'eleven_v3', modelEn: 'eleven_flash_v2_5' } },
};
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
function merge(base, over) {
  if (!isObj(base)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
  return out;
}
function load() {
  try { const raw = localStorage.getItem(KEY); return merge(DEFAULT, raw ? JSON.parse(raw) : {}); } catch { return merge(DEFAULT, {}); }
}
export let S = load();
export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* stockage plein ou bloqué */ } }
export function update(fn) { fn(S); save(); }
export function resetAll() { try { localStorage.removeItem(KEY); } catch { /* ignoré */ } S = load(); }
export function exportJSON() { return JSON.stringify({ ...S, ai: { ...S.ai, key: S.ai.key ? '***' : '' }, voice: { ...S.voice, eleven: { ...S.voice.eleven, key: S.voice.eleven.key ? '***' : '' } } }, null, 2); }
