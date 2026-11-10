// Tests du serveur mandataire (server/worker.js) sans réseau ni compte Cloudflare.
// Lancer : node --test scripts/test-worker.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';

const ORIGIN = 'https://orphee26-gab.github.io';
const SECRET = 'sk-ant-TEST-SECRET-0000';
const CID = '11111111-2222-3333-4444-555555555555';
const allow = { limit: async () => ({ success: true }) };
const env = (over = {}) => ({ ALLOWED_ORIGINS: ORIGIN, ANTHROPIC_API_KEY: SECRET, PER_DEVICE: allow, PER_IP: allow, ...over });
const good = { model: 'claude-haiku-4-5', max_tokens: 500, system: 'Sois bref.', messages: [{ role: 'user', content: 'Bonjour' }] };

function call(e, { method = 'POST', path = '/v1/messages', origin = ORIGIN, body = good, headers = {} } = {}) {
  const h = { 'content-type': 'application/json', 'x-client-id': CID, 'cf-connecting-ip': '203.0.113.7', ...headers };
  if (origin) h.origin = origin;
  const raw = body === undefined || method === 'GET' || method === 'OPTIONS' ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  return worker.fetch(new Request('https://proxy.test' + path, { method, headers: h, body: raw }), e);
}

// Remplace fetch pour observer ce que le serveur enverrait à Anthropic.
async function withUpstream(handler, fn) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(url, init); };
  const quiet = [console.log, console.error];
  console.log = console.error = () => {};
  try { await fn(calls); } finally { globalThis.fetch = real; [console.log, console.error] = quiet; }
}
const ok = () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Salut !' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
const json = async (r) => JSON.parse(await r.text());

test('santé : indique si la clé d\'IA est configurée, sans la révéler', async () => {
  const a = await call(env(), { method: 'GET', path: '/health', origin: '' });
  assert.equal(a.status, 200);
  const body = await a.text();
  assert.deepEqual(JSON.parse(body), { ok: true, service: 'moreh-bakis-proxy', ai: true });
  assert.ok(!body.includes(SECRET));
  assert.equal((await json(await call(env({ ANTHROPIC_API_KEY: undefined }), { method: 'GET', path: '/health', origin: '' }))).ai, false);
});

test('pré-vérification CORS : acceptée pour le site de l\'appli, refusée ailleurs', async () => {
  const yes = await call(env(), { method: 'OPTIONS', headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'anthropic-version,content-type,x-client-id' } });
  assert.equal(yes.status, 204);
  assert.equal(yes.headers.get('access-control-allow-origin'), ORIGIN);
  for (const h of ['content-type', 'anthropic-version', 'x-client-id']) assert.match(yes.headers.get('access-control-allow-headers'), new RegExp(h));
  const no = await call(env(), { method: 'OPTIONS', origin: 'https://pirate.example' });
  assert.equal(no.status, 403);
  assert.equal(no.headers.get('access-control-allow-origin'), null);
});

test('origine inconnue ou absente : 403, Anthropic n\'est pas appelé', async () => {
  await withUpstream(ok, async (calls) => {
    for (const origin of ['https://pirate.example', '']) {
      const r = await call(env(), { origin });
      assert.equal(r.status, 403);
      assert.equal(r.headers.get('access-control-allow-origin'), null);
    }
    assert.equal(calls.length, 0);
  });
});

test('sans clé d\'IA configurée : 503 clair', async () => {
  const r = await call(env({ ANTHROPIC_API_KEY: '' }));
  assert.equal(r.status, 503);
  assert.match((await json(r)).error.message, /pas encore de clé/);
});

test('modèle non autorisé (Opus, inconnu, absent) : 400, Anthropic n\'est pas appelé', async () => {
  await withUpstream(ok, async (calls) => {
    for (const model of ['claude-opus-4-1', 'gpt-4', undefined, 'claude-haiku-4-5; drop']) {
      assert.equal((await call(env(), { body: { ...good, model } })).status, 400, String(model));
    }
    assert.equal(calls.length, 0);
  });
});

test('transmission : en-têtes reconstruits, champs filtrés, max_tokens plafonné, clé du serveur', async () => {
  await withUpstream(ok, async (calls) => {
    const r = await call(env(), { body: { ...good, model: 'claude-sonnet-4-6', max_tokens: 99999, stream: true, tools: [{ name: 'x' }], thinking: { type: 'enabled', budget_tokens: 9999 } } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(calls.length, 1);
    const { url, init } = calls[0];
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    const h = Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]));
    assert.equal(h['x-api-key'], SECRET);
    assert.equal(h['anthropic-version'], '2023-06-01');
    for (const banned of ['origin', 'x-client-id', 'cf-connecting-ip', 'cookie', 'authorization']) assert.equal(h[banned], undefined, banned);
    const sent = JSON.parse(init.body);
    assert.deepEqual(Object.keys(sent).sort(), ['max_tokens', 'messages', 'model', 'system']);
    assert.equal(sent.max_tokens, 2400);
    assert.deepEqual((await json(r)).content[0].text, 'Salut !');
  });
});

test('max_tokens : valeur par défaut et minimum', async () => {
  await withUpstream(ok, async (calls) => {
    await call(env(), { body: { ...good, max_tokens: undefined } });
    await call(env(), { body: { ...good, max_tokens: 12 } });
    await call(env(), { body: { ...good, max_tokens: -5 } });
    assert.deepEqual(calls.map((c) => JSON.parse(c.init.body).max_tokens), [700, 12, 1]); // défaut 700, valeur valide gardée, minimum 1
  });
});

test('cas normal de l\'appli : le texte d\'origine est transmis tel quel (pas de ré-encodage)', async () => {
  await withUpstream(ok, async (calls) => {
    const raw = JSON.stringify(good);
    await call(env(), { body: raw });
    assert.equal(calls[0].init.body, raw);
    await call(env(), { body: JSON.stringify({ ...good, max_tokens: 9000 }) }); // à corriger : ré-encodé
    assert.notEqual(calls[1].init.body, JSON.stringify({ ...good, max_tokens: 9000 }));
    assert.equal(JSON.parse(calls[1].init.body).max_tokens, 2400);
  });
});

test('limite de débit dépassée : 429 « quota », Anthropic n\'est pas appelé', async () => {
  await withUpstream(ok, async (calls) => {
    const keys = [];
    const deny = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
    const r = await call(env({ PER_DEVICE: deny }));
    assert.equal(r.status, 429);
    assert.equal((await json(r)).code, 'quota');
    assert.deepEqual(keys, [CID]);
    assert.equal(calls.length, 0);
    // un identifiant d'appareil invalide retombe sur l'adresse IP
    keys.length = 0;
    await call(env({ PER_DEVICE: deny }), { headers: { 'x-client-id': 'x' } });
    assert.deepEqual(keys, ['203.0.113.7']);
  });
});

test('crédit ou plafond Anthropic épuisé : 429 « quota » côté élève', async () => {
  const body = JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } });
  await withUpstream(() => new Response(body, { status: 400, headers: { 'content-type': 'application/json' } }), async () => {
    const r = await call(env());
    assert.equal(r.status, 429);
    assert.equal((await json(r)).code, 'quota');
  });
});

test('clé du serveur refusée par Anthropic : 502, sans répéter le message d\'Anthropic', async () => {
  await withUpstream(() => new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 }), async () => {
    const r = await call(env());
    assert.equal(r.status, 502);
    assert.ok(!(await r.text()).includes('x-api-key'));
  });
});

test('surcharge 529 : transmise telle quelle pour que l\'appli réessaie', async () => {
  await withUpstream(() => new Response('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', { status: 529, headers: { 'content-type': 'application/json' } }), async () => {
    assert.equal((await call(env())).status, 529);
  });
});

test('Anthropic injoignable : 502', async () => {
  await withUpstream(() => { throw new TypeError('réseau coupé'); }, async () => {
    assert.equal((await call(env())).status, 502);
  });
});

test('corps invalide ou trop gros : 400 / 413', async () => {
  await withUpstream(ok, async (calls) => {
    assert.equal((await call(env(), { body: 'pas du json' })).status, 400);
    assert.equal((await call(env(), { body: { ...good, messages: [] } })).status, 400);
    assert.equal((await call(env(), { headers: { 'content-length': '5000000' } })).status, 413);
    assert.equal((await call(env(), { body: { ...good, system: 'x'.repeat(4_100_000) } })).status, 413);
    assert.equal(calls.length, 0);
  });
});

test('chemin inconnu : 404', async () => {
  assert.equal((await call(env(), { path: '/autre' })).status, 404);
  assert.equal((await call(env(), { method: 'GET', path: '/v1/messages' })).status, 404);
});

test('la clé du serveur n\'apparaît dans aucune réponse', async () => {
  await withUpstream(ok, async () => {
    const answers = [await call(env()), await call(env(), { origin: '' }), await call(env(), { body: 'x' }), await call(env(), { path: '/autre' }), await call(env(), { method: 'GET', path: '/health', origin: '' })];
    for (const r of answers) assert.ok(!(await r.text()).includes(SECRET));
  });
});

test('photo d\'exercice (≈ 0,6 Mo en base64) : le traitement reste rapide', async () => {
  const big = { ...good, model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'A'.repeat(600_000) } }, { type: 'text', text: 'Voici mon exercice.' }] }] };
  await withUpstream(ok, async (calls) => {
    const t0 = performance.now();
    assert.equal((await call(env(), { body: big })).status, 200);
    const ms = performance.now() - t0;
    assert.equal(JSON.parse(calls[0].init.body).messages[0].content[0].source.data.length, 600_000);
    assert.ok(ms < 50, `trop lent : ${ms.toFixed(1)} ms`);
  });
});
