// Tests de la surveillance du serveur (scripts/check-server.mjs), sans réseau.
// Lancer : node --test scripts/test-check-server.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from './check-server.mjs';

const models = { rapide: 'claude-haiku-4-5', photo: 'claude-sonnet-4-6' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const good = () => json(200, { content: [{ type: 'text', text: 'ok' }] });
const opts = { url: 'https://proxy.test/', models, tries: 2, pause: 0 };
function fake(routes) {
  const seen = [];
  const fetchFn = async (url, init) => { seen.push({ url: String(url), init }); return routes(String(url), init, seen); };
  return { fetchFn, seen };
}

test('tout va bien : 3 contrôles verts, 1 appel par modèle', async () => {
  const { fetchFn, seen } = fake((u) => (u.endsWith('/health') ? json(200, { ok: true, ai: true }) : good()));
  const r = await run({ ...opts, fetchFn });
  assert.equal(r.ok, true);
  assert.equal((r.report.match(/✅/g) || []).length, 3);
  const posts = seen.filter((s) => s.init?.method === 'POST');
  assert.deepEqual(posts.map((p) => JSON.parse(p.init.body).model), ['claude-haiku-4-5', 'claude-sonnet-4-6']);
  assert.equal(posts[0].init.headers.origin, 'https://orphee26-gab.github.io');
  assert.equal(JSON.parse(posts[0].init.body).max_tokens, 1);
});

test('le serveur n\'a pas de clé : signalé, aucun appel d\'IA', async () => {
  const { fetchFn, seen } = fake(() => json(200, { ok: true, ai: false }));
  const r = await run({ ...opts, fetchFn });
  assert.equal(r.ok, false);
  assert.match(r.report, /set-ai-key/);
  assert.equal(seen.filter((s) => s.init?.method === 'POST').length, 0);
});

test('crédit épuisé (429 « quota ») : message avec le lien de facturation', async () => {
  const { fetchFn } = fake((u) => (u.endsWith('/health') ? json(200, { ok: true, ai: true }) : json(429, { error: { type: 'rate_limit_error', message: 'quota' }, code: 'quota' })));
  const r = await run({ ...opts, fetchFn });
  assert.equal(r.ok, false);
  assert.match(r.report, /crédit Anthropic/);
  assert.match(r.report, /settings\/billing/);
  assert.match(r.report, /^## Le serveur d'IA ne répond plus/);
});

test('modèle disparu (404) : un seul essai, le modèle est nommé', async () => {
  const { fetchFn, seen } = fake((u, init) => {
    if (u.endsWith('/health')) return json(200, { ok: true, ai: true });
    return JSON.parse(init.body).model === 'claude-sonnet-4-6' ? json(404, { error: { type: 'not_found_error', message: 'model' } }) : good();
  });
  const r = await run({ ...opts, fetchFn });
  assert.equal(r.ok, false);
  assert.match(r.report, /claude-sonnet-4-6 n'existe plus/);
  assert.equal(seen.filter((s) => s.init?.method === 'POST' && JSON.parse(s.init.body).model === 'claude-sonnet-4-6').length, 1);
});

test('surcharge passagère (529 puis 200) : pas de fausse alerte', async () => {
  let n = 0;
  const { fetchFn } = fake((u) => (u.endsWith('/health') ? json(200, { ok: true, ai: true }) : (n++ === 0 ? json(529, { error: { type: 'overloaded_error', message: 'Overloaded' } }) : good())));
  assert.equal((await run({ ...opts, fetchFn })).ok, true);
});

test('serveur injoignable : alerte', async () => {
  const { fetchFn } = fake(() => { throw new TypeError('fetch failed'); });
  const r = await run({ ...opts, fetchFn });
  assert.equal(r.ok, false);
  assert.match(r.report, /ne répond pas/);
});

test('site non autorisé (403) : message sur ALLOWED_ORIGINS', async () => {
  const { fetchFn } = fake((u) => (u.endsWith('/health') ? json(200, { ok: true, ai: true }) : json(403, { error: { type: 'forbidden', message: 'Origine non autorisée' } })));
  assert.match((await run({ ...opts, fetchFn })).report, /ALLOWED_ORIGINS/);
});
