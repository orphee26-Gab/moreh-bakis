// Tests du formulaire de clé (scripts/set-ai-key.mjs) : la clé ne doit fuiter nulle part.
// Lancer : node --test scripts/test-set-ai-key.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleSave, storeSecret, appModels, serve } from './set-ai-key.mjs';

const KEY = 'sk-ant-api03-TESTKEY_abcdefghijklmnopqrstuvwxyz0123456789';
const models = { rapide: 'claude-haiku-4-5', photo: 'claude-sonnet-4-6' };
const fake = (status, detail = '') => async () => ({ status, detail });
const deps = (over = {}) => {
  const seen = { stored: [], checked: [] };
  return { seen, check: async (k, m) => { seen.checked.push([k, m]); return (over.check || fake(200))(k, m); }, store: async (k) => { seen.stored.push(k); return over.store || { ok: true, output: 'ok' }; }, models };
};

test('les modèles vérifiés sont ceux de l\'appli', () => {
  assert.deepEqual(appModels(), { rapide: 'claude-haiku-4-5', photo: 'claude-sonnet-4-6' });
});

test('format invalide : rien n\'est envoyé à Anthropic ni à Cloudflare', async () => {
  for (const bad of ['', 'pas une clé', 'sk-ant-court', KEY + ' avec espace', 'sk-ant-api03-ABC\nDEF0123456789012345']) {
    const d = deps();
    const r = await handleSave(bad, d);
    assert.equal(r.ok, false, bad);
    assert.equal(d.seen.checked.length + d.seen.stored.length, 0);
  }
});

test('clé refusée par Anthropic (401) : non enregistrée', async () => {
  const d = deps({ check: fake(401) });
  const r = await handleSave(KEY, d);
  assert.equal(r.ok, false);
  assert.equal(d.seen.stored.length, 0);
  assert.ok(!JSON.stringify(r).includes(KEY));
});

test('clé valide : vérifiée sur les deux modèles puis enregistrée une fois', async () => {
  const d = deps();
  const r = await handleSave(`  ${KEY}\n`, d);
  assert.equal(r.ok, true);
  assert.deepEqual(d.seen.checked.map(([, m]) => m), ['claude-haiku-4-5', 'claude-sonnet-4-6']);
  assert.deepEqual(d.seen.stored, [KEY]);
  assert.deepEqual(r.codes, { rapide: 200, photo: 200 });
  assert.ok(!JSON.stringify(r).includes(KEY));
});

test('plus de crédit : la clé est enregistrée mais l\'avertissement est clair', async () => {
  const d = deps({ check: fake(400, 'Your credit balance is too low to access the Anthropic API.') });
  const r = await handleSave(KEY, d);
  assert.equal(r.ok, true);
  assert.match(r.message, /plus de crédit/);
});

test('modèle introuvable : signalé', async () => {
  const d = deps({ check: async (k, m) => ({ status: m === 'claude-sonnet-4-6' ? 404 : 200, detail: '' }) });
  const r = await handleSave(KEY, d);
  assert.match(r.message, /claude-sonnet-4-6/);
});

test('échec de l\'enregistrement : message sans la clé, même si Cloudflare la répétait', async () => {
  const d = deps({ store: { ok: false, output: `erreur avec ${KEY} dans le texte` } });
  const r = await handleSave(KEY, d);
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(KEY));
});

test('wrangler reçoit la clé par son entrée standard, et sa sortie est masquée', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-'));
  const stub = path.join(dir, 'wrangler-stub.sh');
  const got = path.join(dir, 'recu.txt');
  fs.writeFileSync(stub, `#!/bin/sh\ncat > "${got}"\necho "args: $@"\necho "écho de la clé : $(cat "${got}")"\n`, { mode: 0o755 });
  process.env.WRANGLER_BIN = stub;
  try {
    const r = await storeSecret(KEY);
    assert.equal(r.ok, true);
    assert.equal(fs.readFileSync(got, 'utf8').trim(), KEY);
    assert.match(r.output, /args: secret put ANTHROPIC_API_KEY/);
    assert.ok(!r.output.includes(KEY) && r.output.includes('***'));
  } finally { delete process.env.WRANGLER_BIN; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('serveur local : jeton obligatoire, origine vérifiée, état écrit sans la clé', async () => {
  const statusFile = path.join(os.tmpdir(), `etat-${process.pid}.json`);
  const calls = [];
  const { server, token } = serve({ port: 0, statusFile, handler: async (body) => { calls.push(body); return { ok: true, codes: { rapide: 200 }, message: 'fait' }; } });
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (headers, body = KEY) => fetch(`${base}/save?t=${token}`, { method: 'POST', body, headers });
  try {
    assert.equal((await fetch(base + '/')).status, 404);
    assert.equal((await fetch(`${base}/?t=mauvais`)).status, 404);
    const page = await fetch(`${base}/?t=${token}`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.ok(!(await page.text()).includes('sk-ant-api03'));
    assert.equal((await post({ origin: 'https://pirate.example' })).status, 403);
    assert.equal((await post({})).status, 403);
    assert.equal((await post({ origin: base }, 'x'.repeat(600))).status, 413);
    assert.equal(calls.length, 0);
    const good = await post({ origin: base });
    assert.deepEqual(await good.json(), { ok: true, message: 'fait' });
    assert.deepEqual(calls, [KEY]);
    const state = fs.readFileSync(statusFile, 'utf8');
    assert.equal(JSON.parse(state).stored, true);
    assert.ok(!state.includes(KEY));
  } finally { server.close(); fs.rmSync(statusFile, { force: true }); }
});
