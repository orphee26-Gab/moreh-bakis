// Formulaire local pour enregistrer la clé d'IA dans le secret Cloudflare du serveur.
// La clé est collée dans une page locale (127.0.0.1, jeton à usage unique dans l'adresse) : elle n'est ni affichée,
// ni écrite dans un fichier, ni journalisée, ni transmise à l'assistant. Elle est vérifiée auprès d'Anthropic
// (deux appels d'un seul mot, quelques millièmes de centime), puis envoyée à `wrangler secret put` par son entrée standard.
// Usage : node scripts/set-ai-key.mjs   puis ouvrir l'adresse affichée. Utile aussi pour changer de clé plus tard.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
const CREDIT_RE = /credit balance|usage limit|spend limit/i;

// Les modèles vérifiés sont ceux que l'appli demande réellement (js/store.js).
export function appModels(file = path.join(root, 'js/store.js')) {
  const src = fs.readFileSync(file, 'utf8');
  return { rapide: src.match(/\bmodel: '([^']+)'/)[1], photo: src.match(/visionModel: '([^']+)'/)[1] };
}

export async function checkModel(key, model, fetchFn = fetch) {
  const res = await fetchFn(process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': key },
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
  });
  let detail = '';
  if (!res.ok) { try { detail = (await res.json()).error?.message || ''; } catch { /* corps vide */ } }
  return { status: res.status, detail };
}

export function storeSecret(key) {
  return new Promise((resolve) => {
    const p = spawn(process.env.WRANGLER_BIN || 'wrangler', ['secret', 'put', 'ANTHROPIC_API_KEY'], { cwd: path.join(root, 'server'), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', (e) => resolve({ ok: false, output: String(e.message) }));
    p.on('close', (code) => resolve({ ok: code === 0, output: out.split(key).join('***').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim().slice(-300) }));
    p.stdin.on('error', () => {});
    p.stdin.end(key + '\n');
  });
}

export async function handleSave(raw, { check = checkModel, store = storeSecret, models = appModels() } = {}) {
  const key = String(raw || '').trim();
  if (!KEY_RE.test(key)) return { ok: false, message: 'Ça ne ressemble pas à une clé Anthropic : elle commence par sk-ant- et ne contient ni espace ni retour à la ligne.' };
  const results = {};
  for (const [label, model] of Object.entries(models)) results[label] = await check(key, model);
  const all = Object.values(results);
  if (all.some((r) => r.status === 401)) return { ok: false, message: 'Anthropic refuse cette clé. Vérifie qu\'elle est complète ou crée-en une nouvelle.' };
  if (all.some((r) => r.status === 403)) return { ok: false, message: 'Cette clé n\'a pas le droit d\'utiliser les modèles de l\'appli.' };
  const stored = await store(key);
  const codes = Object.fromEntries(Object.entries(results).map(([l, r]) => [l, r.status]));
  if (!stored.ok) return { ok: false, codes, message: 'La clé est valide, mais son enregistrement dans Cloudflare a échoué : ' + String(stored.output).split(key).join('***') };
  const notes = [];
  if (all.some((r) => r.status === 400 && CREDIT_RE.test(r.detail))) notes.push('⚠️ Le compte Anthropic n\'a plus de crédit : achète des crédits sur la page Billing avant de tester l\'appli.');
  const missing = Object.entries(results).filter(([, r]) => r.status === 404).map(([l]) => models[l]);
  if (missing.length) notes.push('⚠️ Modèle introuvable chez Anthropic : ' + missing.join(', ') + '. À corriger dans l\'appli.');
  return { ok: true, codes, message: ['Clé enregistrée dans Cloudflare ✅', ...notes].join('\n') };
}

const page = (token) => `<!doctype html><html lang="fr" dir="ltr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clé d'IA</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1b1b1f}
input{width:100%;padding:12px;font-size:16px;border:1px solid #888;border-radius:8px;box-sizing:border-box}
button{margin-top:12px;padding:12px 18px;font-size:16px;border:0;border-radius:8px;background:#5b3df5;color:#fff;cursor:pointer}
button:disabled{opacity:.5}#out{margin-top:16px;white-space:pre-wrap}.ok{color:#0a7a2f}.err{color:#b00020}</style>
<h2>Clé d'IA pour le serveur de Nitzotz</h2>
<p>Colle ici la clé créée dans la console Claude (elle commence par <code>sk-ant-</code>). Elle part directement vers Cloudflare : elle n'est ni affichée, ni enregistrée dans un fichier, ni envoyée à l'assistant.</p>
<input id="k" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." autofocus>
<button id="go">Enregistrer la clé</button>
<div id="out" role="status"></div>
<script>
document.getElementById('go').onclick = async () => {
  const k = document.getElementById('k'), out = document.getElementById('out'), go = document.getElementById('go');
  out.className = ''; out.textContent = 'Vérification en cours…'; go.disabled = true;
  try {
    const r = await fetch('/save?t=${token}', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: k.value });
    const j = await r.json(); k.value = '';
    out.className = j.ok ? 'ok' : 'err'; out.textContent = j.message;
    if (j.ok) go.textContent = 'Terminé';
    else go.disabled = false;
  } catch (e) { out.className = 'err'; out.textContent = 'Erreur : ' + e.message; go.disabled = false; }
};
</script></html>`;

export function serve({ port = 8799, handler = handleSave, statusFile = process.env.AI_KEY_STATUS_FILE, idleMs = 30 * 60 * 1000 } = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  const originNow = () => `http://127.0.0.1:${server.address()?.port ?? port}`;
  let finished = false;
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (u.searchParams.get('t') !== token) { res.writeHead(404); return res.end(); }
    if (req.method === 'GET' && u.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'" });
      return res.end(page(token));
    }
    if (req.method === 'POST' && u.pathname === '/save') {
      if (req.headers.origin !== originNow()) return json(403, { ok: false, message: 'Origine refusée.' });
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 512) return json(413, { ok: false, message: 'Texte trop long.' }); }
      const out = await handler(body);
      if (out.ok && !finished) {
        finished = true;
        if (statusFile) fs.writeFileSync(statusFile, JSON.stringify({ stored: true, codes: out.codes, at: new Date().toISOString() }));
        setTimeout(() => server.close(), 3000);
      }
      return json(200, { ok: out.ok, message: out.message });
    }
    res.writeHead(404); res.end();
  });
  server.listen(port, '127.0.0.1', () => console.log(`Ouvre cette adresse : ${originNow()}/?t=${token}`));
  setTimeout(() => server.close(), idleMs).unref();
  return { server, token };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) serve();
