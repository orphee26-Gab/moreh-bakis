// Vérifie que le serveur d'IA fonctionne vraiment : il répond, il possède une clé, le crédit n'est pas épuisé
// et les modèles utilisés par l'appli existent. Chaque modèle reçoit une demande d'un seul mot (≈ 0,00002 $).
// Utilisé chaque semaine par .github/workflows/check-server.yml.
// Usage : node scripts/check-server.mjs [--url <adresse>]   (par défaut : l'adresse de data/server.json)
// Sortie : un rapport en Markdown. Code 0 : tout va bien, ou serveur pas encore déployé. Code 1 : problème.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appModels } from './set-ai-key.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://orphee26-gab.github.io';
const CLIENT_ID = 'surveillance-hebdomadaire-0001';
const RETRY = new Set([429, 500, 502, 503, 504, 529]);
const BILLING = 'https://platform.claude.com/settings/billing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function explain(status, err = {}, model = '') {
  if (status === 403) return "Le serveur refuse l'adresse du site : vérifier ALLOWED_ORIGINS dans server/wrangler.toml.";
  if (status === 503) return "Le serveur n'a pas de clé d'IA : lancer node scripts/set-ai-key.mjs.";
  if (status === 429) return `Le serveur répond « quota » : le crédit Anthropic est probablement épuisé (${BILLING}), ou la limite de débit est atteinte.`;
  if (status === 502) return 'Anthropic refuse la clé du serveur ou ne répond pas : créer une nouvelle clé dans la console Claude, puis lancer node scripts/set-ai-key.mjs.';
  if (status === 404 || err?.type === 'not_found_error') return `Le modèle ${model} n'existe plus chez Anthropic : mettre à jour js/store.js et la liste des réglages.`;
  return `Réponse inattendue (HTTP ${status}${err?.message ? ' : ' + String(err.message).slice(0, 120) : ''}).`;
}

async function health(base, { fetchFn, tries, pause }) {
  let why = '';
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(pause);
    try {
      const res = await fetchFn(`${base}/health`, { signal: AbortSignal.timeout(20000) });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok && j.ai) return { ok: true };
      if (res.ok && j?.ok) return { ok: false, why: explain(503) };
      why = `Le serveur répond de façon inattendue (HTTP ${res.status}).`;
    } catch (e) { why = `Le serveur ne répond pas (${e.message}).`; }
  }
  return { ok: false, why };
}

async function probe(base, model, { fetchFn, tries, pause }) {
  let why = '';
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(pause);
    try {
      const res = await fetchFn(`${base}/v1/messages`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-client-id': CLIENT_ID },
        body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.content)) return { ok: true };
      why = explain(res.status, data?.error, model);
      if (!RETRY.has(res.status)) break;
    } catch (e) { why = `Le serveur ne répond pas (${e.message}).`; }
  }
  return { ok: false, why };
}

export async function run({ url, models = appModels(), fetchFn = fetch, tries = 3, pause = 5000 } = {}) {
  const base = url.replace(/\/$/, '');
  const opts = { fetchFn, tries, pause };
  const lines = [];
  let ok = true;
  const h = await health(base, opts);
  lines.push(h.ok ? "✅ Le serveur répond et possède une clé d'IA." : `❌ ${h.why}`);
  if (h.ok) {
    for (const [label, model] of Object.entries(models)) {
      const p = await probe(base, model, opts);
      lines.push(p.ok ? `✅ Modèle « ${label} » (${model}) : répond.` : `❌ Modèle « ${label} » (${model}) : ${p.why}`);
      ok = ok && p.ok;
    }
  } else ok = false;
  const report = ok
    ? `Serveur d'IA : tout fonctionne.\n\n${lines.join('\n')}\n`
    : `## Le serveur d'IA ne répond plus correctement\n\nAdresse : ${base}\n\n${lines.join('\n')}\n\nTant que ce n'est pas corrigé, les élèves voient un message d'erreur dans l'appli.\n\n_Rapport généré par scripts/check-server.mjs._\n`;
  return { ok, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--url');
  let url = i > 0 ? process.argv[i + 1] : '';
  if (!url) {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'data/server.json'), 'utf8'));
    if (!cfg.proxyUrl || cfg.deployed === false) { console.log("Serveur d'IA : pas encore déployé, rien à vérifier."); process.exit(0); }
    url = cfg.proxyUrl;
  }
  const out = await run({ url });
  console.log(out.report);
  process.exit(out.ok ? 0 : 1);
}
