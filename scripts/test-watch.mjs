#!/usr/bin/env node
/**
 * Tests hors ligne de scripts/watch-ministry.mjs.
 *
 * Un petit serveur HTTP local (127.0.0.1, port libre) joue le rôle du ministère : fausses pages,
 * faux fichiers avec leurs en-têtes (ETag, Last-Modified, Content-Length), erreurs 500, HEAD refusé…
 * Le script est lancé comme en production (processus séparé, options --sources/--snapshot/--diff,
 * fichier GITHUB_OUTPUT temporaire). Aucun accès au réseau, aucune dépendance.
 *
 * Les scénarios 1 à 11 se suivent : chacun part de l'état laissé par le précédent.
 *
 * Usage : node scripts/test-watch.mjs        (code de sortie 1 si un test échoue)
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  USER_AGENT,
  buildSnapshot,
  compareSnapshots,
  decodeEntities,
  extractFileLinks,
  normalizeFileUrl,
  renderReport,
  samePage,
} from './watch-ministry.mjs';

const SCRIPT = fileURLToPath(new URL('./watch-ministry.mjs', import.meta.url));
const LM = 'Mon, 05 Jan 2026 08:00:00 GMT';
const LM2 = 'Tue, 06 Jan 2026 09:30:00 GMT';
const HE = '/files/תוכנית.PDF'; // chemin décodé côté serveur

// ---------------------------------------------------------------------------
// Faux ministère
// ---------------------------------------------------------------------------

const state = { pages: {}, files: {}, headMode: 'ok', rangeMode: 'honor', weakEtag: false, omitLength: false, flaky: {}, redirects: {}, log: [] };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.on('error', () => {});
      res.on('error', () => {});
      const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      state.log.push({ method: req.method, path: pathname, ua: req.headers['user-agent'], range: req.headers.range ?? null, ae: req.headers['accept-encoding'] ?? null });
      if (state.flaky[pathname] > 0) {
        state.flaky[pathname] -= 1;
        res.writeHead(500);
        res.end('boom');
        return;
      }
      const redirect = state.redirects[pathname];
      if (redirect) {
        res.writeHead(redirect.status, { location: redirect.to });
        res.end();
        return;
      }
      const page = state.pages[pathname];
      if (page) {
        res.writeHead(page.status, { 'content-type': 'text/html; charset=utf-8' });
        res.end(page.status === 200 ? page.html : 'erreur');
        return;
      }
      const file = state.files[pathname];
      if (!file) {
        res.writeHead(404);
        res.end('introuvable');
        return;
      }
      if (file.status) {
        res.writeHead(file.status); // panne simulée sur le fichier (503…)
        res.end();
        return;
      }
      const headers = { 'content-type': 'application/octet-stream', etag: state.weakEtag ? `W/${file.etag}` : file.etag, 'last-modified': file.lastModified, 'accept-ranges': 'bytes' };
      if (req.method === 'HEAD') {
        if (state.headMode !== 'ok') {
          res.writeHead(Number(state.headMode)); // HEAD refusé (405, 403…)
          res.end();
          return;
        }
        res.writeHead(200, state.omitLength ? headers : { ...headers, 'content-length': String(file.length) }); // omitLength : CDN capricieux
        res.end();
        return;
      }
      if (req.headers.range && state.rangeMode === 'honor') {
        res.writeHead(206, { ...headers, 'content-length': '1', 'content-range': `bytes 0-0/${file.length}` });
        res.end('x');
        return;
      }
      res.writeHead(200, { ...headers, 'content-length': String(file.length) }); // Range ignoré : corps complet
      res.end(Buffer.alloc(file.length, 0x78));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const htmlPage = (hrefs) =>
  `<!doctype html><html lang="he"><head><meta charset="utf-8"><title>essai</title></head><body>\n` +
  hrefs.map((h) => `<p><a href="${h}">lien</a></p>`).join('\n') +
  `\n</body></html>`;

// ---------------------------------------------------------------------------
// Outillage
// ---------------------------------------------------------------------------

let server;
let base;
let tmp;
let srcFile;
let snapFile;
let diffFile;
let hrefsA;
const K = {}; // identifiants de fichiers attendus dans les snapshots

const exists = (file) => access(file).then(() => true, () => false);
const readSnap = async (file = snapFile) => JSON.parse(await readFile(file, 'utf8'));
const setPage = (p, hrefs, status = 200) => {
  state.pages[p] = { status, html: htmlPage(hrefs) };
};

function runRaw(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: '', GITHUB_ACTIONS: '', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** Lance le script avec un GITHUB_OUTPUT neuf et sans rapport préexistant. */
async function run(extra = [], { snapshot = snapFile, sources = srcFile } = {}) {
  const outFile = path.join(tmp, 'github_output.txt');
  await writeFile(outFile, '');
  await rm(diffFile, { force: true });
  const result = await runRaw(
    ['--sources', sources, '--snapshot', snapshot, '--diff', diffFile, '--pause-ms', '0', '--retry-delay-ms', '5', '--timeout-ms', '5000', ...extra],
    { GITHUB_OUTPUT: outFile },
  );
  return { ...result, output: await readFile(outFile, 'utf8') };
}

async function setup() {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'watch-ministry-test-'));
  server = await startServer();
  base = `http://127.0.0.1:${server.address().port}`;
  srcFile = path.join(tmp, 'sources.json');
  snapFile = path.join(tmp, 'snapshot.json');
  diffFile = path.join(tmp, 'diff.md');
  Object.assign(K, {
    prog: `${base}/files/programme.pdf`,
    he: `${base}${HE}`,
    rel: `${base}/files/relative.xlsx`,
    exam: `${base}/files/exam.docx`,
    single: `${base}/files/single.pdf`,
    nouveau: `${base}/files/nouveau-2027.pdf`,
    autre: `${base}/files/autre.pdf`,
    mort: `${base}/files/mort.pdf`,
  });
  state.files['/files/programme.pdf'] = { etag: '"p1"', lastModified: LM, length: 1111 };
  state.files[HE] = { etag: '"h1"', lastModified: LM, length: 3000 };
  state.files['/files/relative.xlsx'] = { etag: '"r1"', lastModified: LM, length: 4000 };
  state.files['/files/exam.docx'] = { etag: '"e1"', lastModified: LM, length: 4096 };
  state.files['/files/single.pdf'] = { etag: '"s1"', lastModified: LM, length: 5000 };
  hrefsA = [
    '/files/programme.pdf?v=20260101', // paramètre de cache
    '/files/programme.pdf', // doublon
    `${base}/files/%D7%AA%D7%95%D7%9B%D7%A0%D7%99%D7%AA.PDF?csrt=42#haut`, // absolu, hébreu encodé, extension en majuscules
    '../files/relative.xlsx', // relatif
    '/page/b', // page HTML : ignorée
    '/files/photo.jpg', // image : ignorée
    'mailto:prof@example.org',
    'javascript:void(0)',
  ];
  setPage('/page/a', hrefsA);
  setPage('/page/b', ['/files/exam.docx']);
  await writeFile(
    srcFile,
    JSON.stringify(
      [
        { id: 'alpha', subject: 'math', url: `${base}/page/a` },
        { id: 'beta', subject: 'physics', url: `${base}/page/b` },
        { id: 'single', subject: 'bagrut', url: `${base}/files/single.pdf` },
      ],
      null,
      2,
    ),
  );
}

async function teardown() {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await rm(tmp, { recursive: true, force: true });
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------------------
// Scénarios exigés (1 à 7) et cas voisins
// ---------------------------------------------------------------------------

test('1. référence : première exécution sans snapshot, aucune alerte', async () => {
  const r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=false$/m);
  assert.equal(await exists(diffFile), false, 'aucun rapport pour une simple référence');
  const snap = await readSnap();
  assert.deepEqual(Object.keys(snap.sources), ['alpha', 'beta', 'single']);
  assert.ok(Object.values(snap.sources).every((s) => s.ok === true));
  assert.deepEqual(Object.keys(snap.sources.alpha.files), [K.prog, K.he, K.rel].sort()); // dédoublonné, décodé, sans ?v= ni #
  assert.deepEqual(snap.sources.alpha.files[K.prog], { etag: '"p1"', lastModified: LM, length: 1111 });
  assert.deepEqual(Object.keys(snap.sources.beta.files), [K.exam]);
  assert.deepEqual(Object.keys(snap.sources.single.files), [K.single]);
  assert.ok(!Number.isNaN(Date.parse(snap.generatedAt)));
  assert.ok(state.log.length > 0 && state.log.every((e) => e.ua === USER_AGENT), 'User-Agent honnête partout');
  assert.ok(state.log.filter((e) => e.path.startsWith('/files/')).every((e) => e.method === 'HEAD'), 'HEAD, jamais GET, pour les fichiers');
  assert.ok(state.log.filter((e) => e.path.startsWith('/files/')).every((e) => e.ae === 'identity'), 'Accept-Encoding: identity (pas de compression à la volée)');
});

test('2. relance sans changement : changed=false, aucun rapport, snapshot intact', async () => {
  const before = await readFile(snapFile, 'utf8');
  const r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=false$/m);
  assert.equal(await exists(diffFile), false);
  assert.equal(await readFile(snapFile, 'utf8'), before);
});

test('3. fichier ajouté : rapport en français et changed=true', async () => {
  state.files['/files/nouveau-2027.pdf'] = { etag: '"n1"', lastModified: LM2, length: 3333 };
  hrefsA.push('/files/nouveau-2027.pdf');
  setPage('/page/a', hrefsA);
  const r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=true$/m);
  const diff = await readFile(diffFile, 'utf8');
  assert.match(diff, /^# Le ministère a publié des changements/);
  assert.match(diff, /## Mathématiques/);
  assert.match(diff, /Fichiers ajoutés \(1\)/);
  assert.ok(diff.includes(`[nouveau-2027.pdf](${K.nouveau})`), 'lien cliquable vers le fichier');
  assert.ok(diff.includes('3 333 octets'));
  assert.doesNotMatch(diff, /Fichiers (modifiés|retirés)/);
  assert.ok(K.nouveau in (await readSnap()).sources.alpha.files, 'le snapshot est mis à jour');
  assert.match((await run()).output, /^changed=false$/m, 'et l’alerte ne se répète pas');
});

test('4. fichier modifié (etag, date, taille) : détecté, y compris pour un document unique', async () => {
  state.files['/files/programme.pdf'].etag = '"p2"';
  Object.assign(state.files['/files/exam.docx'], { lastModified: LM2, length: 7777 });
  state.files['/files/single.pdf'].etag = '"s2"';
  const r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=true$/m);
  const diff = await readFile(diffFile, 'utf8');
  assert.equal(diff.match(/Fichiers modifiés \(1\)/g)?.length, 3, 'une section par source modifiée');
  assert.ok(diff.includes('ETag : `"p1"` → `"p2"`'));
  assert.ok(diff.includes('ETag : `"s1"` → `"s2"`'));
  assert.ok(diff.includes(`Dernière modification : \`${LM}\` → \`${LM2}\``));
  assert.ok(diff.includes('Taille : 4 096 octets → 7 777 octets'));
  assert.ok(diff.includes('## Physique') && diff.includes('## Bagrout'));
  assert.doesNotMatch(diff, /Fichiers (ajoutés|retirés)/);
  assert.equal((await readSnap()).sources.alpha.files[K.prog].etag, '"p2"');
});

test('5. fichier retiré de la page : signalé comme retiré', async () => {
  hrefsA = hrefsA.filter((h) => !h.includes('relative.xlsx'));
  setPage('/page/a', hrefsA);
  const r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=true$/m);
  const diff = await readFile(diffFile, 'utf8');
  assert.match(diff, /Fichiers retirés \(1\)/);
  assert.ok(diff.includes('relative.xlsx'));
  assert.ok(!((K.rel) in (await readSnap()).sources.alpha.files));
});

test('6. source en erreur (500) : signalée comme erreur, jamais comme « fichiers retirés »', async () => {
  const before = await readSnap();
  setPage('/page/b', ['/files/exam.docx'], 500);
  state.log.length = 0;
  const r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=false$/m);
  assert.equal(await exists(diffFile), false);
  assert.match(r.stdout, /beta[^\n]*HTTP 500/);
  const after = await readSnap();
  assert.equal(after.sources.beta.ok, false);
  assert.equal(after.sources.beta.error, 'HTTP 500');
  assert.equal(after.sources.beta.carriedOver, true);
  assert.deepEqual(after.sources.beta.files, before.sources.beta.files, 'état précédent conservé');
  assert.equal(state.log.filter((e) => e.path === '/page/b').length, 3, '1 essai + 2 nouvelles tentatives');
});

test('6b. erreur et vrai changement en même temps : les deux apparaissent, sans faux retrait', async () => {
  state.files['/files/autre.pdf'] = { etag: '"a1"', lastModified: LM, length: 10 };
  hrefsA.push('/files/autre.pdf');
  setPage('/page/a', hrefsA);
  const r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=true$/m);
  const diff = await readFile(diffFile, 'utf8');
  assert.ok(diff.includes('autre.pdf'));
  assert.match(diff, /## Erreurs de lecture/);
  assert.ok(diff.includes('**beta**') && diff.includes('HTTP 500'));
  assert.doesNotMatch(diff, /Fichiers retirés/);
  assert.ok(!diff.includes('exam.docx'));
});

test('6c. la source revient : comparée à l’état conservé, aucun faux ajout', async () => {
  setPage('/page/b', ['/files/exam.docx']);
  const r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=false$/m);
  assert.equal(await exists(diffFile), false);
  const snap = await readSnap();
  assert.equal(snap.sources.beta.ok, true);
  assert.equal(snap.sources.beta.carriedOver, undefined);
  assert.deepEqual(Object.keys(snap.sources.beta.files), [K.exam]);
});

test('7. HEAD refusé (405, 403, Range ignoré) : repli sur GET avec Range: bytes=0-0', async () => {
  const fresh = path.join(tmp, 'snapshot-head.json');
  for (const [headMode, rangeMode] of [['405', 'honor'], ['403', 'honor'], ['405', 'ignore']]) {
    Object.assign(state, { headMode, rangeMode });
    state.log.length = 0;
    await rm(fresh, { force: true });
    const r = await run([], { snapshot: fresh });
    assert.equal(r.code, 0, r.stderr);
    const snap = await readSnap(fresh);
    let checked = 0;
    for (const source of Object.values(snap.sources)) {
      assert.equal(source.ok, true, `${headMode}/${rangeMode} : ${source.error}`);
      for (const [url, meta] of Object.entries(source.files)) {
        const expected = state.files[decodeURIComponent(new URL(url).pathname)];
        assert.deepEqual(meta, { etag: expected.etag, lastModified: expected.lastModified, length: expected.length }, url);
        checked += 1;
      }
    }
    assert.ok(checked >= 5, 'tous les fichiers ont été relevés');
    const gets = state.log.filter((e) => e.method === 'GET' && e.path.startsWith('/files/'));
    assert.ok(gets.length >= 5 && gets.every((e) => e.range === 'bytes=0-0'), 'GET uniquement avec Range: bytes=0-0');
  }
  Object.assign(state, { headMode: 'ok', rangeMode: 'honor' });
});

test('8. source illisible dès la référence : référence silencieuse à la première lecture réussie', async () => {
  const fresh = path.join(tmp, 'snapshot-late.json');
  setPage('/page/b', ['/files/exam.docx'], 503);
  let r = await run([], { snapshot: fresh });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=false$/m);
  let snap = await readSnap(fresh);
  assert.deepEqual(snap.sources.beta, { url: `${base}/page/b`, ok: false, error: 'HTTP 503', files: {} });
  setPage('/page/b', ['/files/exam.docx']);
  r = await run([], { snapshot: fresh });
  assert.match(r.output, /^changed=false$/m, 'pas d’alerte pour une première lecture');
  assert.equal(await exists(diffFile), false);
  snap = await readSnap(fresh);
  assert.equal(snap.sources.beta.ok, true);
  assert.deepEqual(Object.keys(snap.sources.beta.files), [K.exam]);
});

test('9. --dry-run : n’écrit ni snapshot, ni rapport, ni GITHUB_OUTPUT', async () => {
  state.files['/files/programme.pdf'].etag = '"p3"';
  const before = await readFile(snapFile, 'utf8');
  const r = await run(['--dry-run']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(await readFile(snapFile, 'utf8'), before);
  assert.equal(await exists(diffFile), false);
  assert.equal(r.output, '');
  assert.ok(r.stdout.includes('programme.pdf') && r.stdout.includes('Fichiers modifiés'), 'le rapport est affiché');
  const real = await run();
  assert.match(real.output, /^changed=true$/m, 'le changement n’a pas été consommé par la simulation');
});

test('10. page qui échoue une fois (500) : la nouvelle tentative suffit', async () => {
  state.flaky['/page/a'] = 1;
  state.log.length = 0;
  const r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=false$/m);
  assert.equal((await readSnap()).sources.alpha.ok, true);
  assert.equal(state.log.filter((e) => e.path === '/page/a').length, 2);
});

test('11a. lien mort (404) : suivi avec son statut, puis « modifié » quand le fichier apparaît', async () => {
  hrefsA.push('/files/mort.pdf');
  setPage('/page/a', hrefsA);
  let r = await run();
  assert.match(r.output, /^changed=true$/m);
  let diff = await readFile(diffFile, 'utf8');
  assert.ok(diff.includes('mort.pdf') && diff.includes('HTTP 404'));
  assert.equal((await readSnap()).sources.alpha.files[K.mort].status, 404);
  state.files['/files/mort.pdf'] = { etag: '"m1"', lastModified: LM, length: 77 };
  r = await run();
  assert.match(r.output, /^changed=true$/m);
  diff = await readFile(diffFile, 'utf8');
  assert.ok(diff.includes('Statut HTTP : HTTP 404 → HTTP 200'));
  assert.equal((await readSnap()).sources.alpha.files[K.mort].status, undefined);
});

test('11b. fichier momentanément illisible (503) : dernière valeur conservée, jamais « modifié »', async () => {
  const before = (await readSnap()).sources.alpha.files[K.prog];
  state.files['/files/programme.pdf'].status = 503;
  const r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=false$/m);
  assert.match(r.stdout, /fichier non vérifié[^\n]*programme\.pdf[^\n]*HTTP 503/);
  assert.deepEqual((await readSnap()).sources.alpha.files[K.prog], before);
  delete state.files['/files/programme.pdf'].status;
});

test('12. un fichier lié par deux sources n’est interrogé qu’une fois', async () => {
  const dupSources = path.join(tmp, 'sources-dup.json');
  await writeFile(
    dupSources,
    JSON.stringify([
      { id: 'dup1', subject: 'math', url: `${base}/page/a` },
      { id: 'dup2', subject: 'physics', url: `${base}/page/a` },
    ]),
  );
  state.log.length = 0;
  const r = await run([], { snapshot: path.join(tmp, 'snapshot-dup.json'), sources: dupSources });
  assert.equal(r.code, 0, r.stderr);
  const heads = state.log.filter((e) => e.method === 'HEAD').map((e) => e.path);
  assert.ok(heads.length >= 4);
  assert.equal(new Set(heads).size, heads.length, 'aucun fichier interrogé deux fois');
  const snap = await readSnap(path.join(tmp, 'snapshot-dup.json'));
  assert.deepEqual(snap.sources.dup1.files, snap.sources.dup2.files);
});

test('13. en-têtes instables du CDN (ETag faible, Content-Length omis) : aucune fausse modification', async () => {
  const before = (await readSnap()).sources.alpha.files[K.prog];
  Object.assign(state, { weakEtag: true, omitLength: true });
  let r = await run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=false$/m);
  assert.deepEqual((await readSnap()).sources.alpha.files[K.prog], before, 'le snapshot garde les valeurs déjà connues');
  // la valeur omise n'empêche pas de voir un vrai changement quand elle réapparaît
  Object.assign(state, { weakEtag: false, omitLength: false });
  state.files['/files/programme.pdf'].length = 2048;
  r = await run();
  assert.match(r.output, /^changed=true$/m);
  assert.ok((await readFile(diffFile, 'utf8')).includes('Taille : 1 111 octets → 2 048 octets'));
});

test('14. vrai changement pendant que le CDN omet des en-têtes : détecté, sans seconde alerte au retour', async () => {
  state.omitLength = true;
  state.files['/files/programme.pdf'].lastModified = LM2;
  let r = await run();
  assert.match(r.output, /^changed=true$/m);
  const diff = await readFile(diffFile, 'utf8');
  assert.ok(diff.includes('Dernière modification'));
  assert.ok(!diff.includes('Taille'), 'la taille omise n’est pas signalée comme modifiée');
  state.omitLength = false;
  r = await run();
  assert.match(r.output, /^changed=false$/m, 'la taille qui réapparaît ne déclenche pas une seconde alerte');
});

test('15. page redirigée ailleurs (le portail renvoie vers l’accueil) : erreur de source, jamais « fichiers retirés »', async () => {
  const sources = path.join(tmp, 'sources-moved.json');
  const snapshot = path.join(tmp, 'snapshot-moved.json');
  await writeFile(
    sources,
    JSON.stringify([
      { id: 'moved', subject: 'math', url: `${base}/page/moved` },
      { id: 'slash', subject: 'math', url: `${base}/page/slash` },
    ]),
  );
  setPage('/page/moved', ['/files/exam.docx']);
  setPage('/page/slash/', ['/files/exam.docx']);
  state.redirects['/page/slash'] = { status: 301, to: '/page/slash/' }; // redirection légitime : barre finale
  let r = await run([], { snapshot, sources });
  assert.equal(r.code, 0, r.stderr);
  let snap = await readSnap(snapshot);
  assert.deepEqual([snap.sources.moved.ok, snap.sources.slash.ok], [true, true], 'la barre finale ajoutée par le serveur est acceptée');
  assert.deepEqual(Object.keys(snap.sources.slash.files), [K.exam]);
  // la page disparaît : le portail renvoie vers l'accueil (200 final, sans aucun lien vers un fichier)
  state.redirects['/page/moved'] = { status: 302, to: '/' };
  setPage('/', ['/page/a']);
  r = await run([], { snapshot, sources });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.output, /^changed=false$/m);
  assert.equal(await exists(diffFile), false);
  snap = await readSnap(snapshot);
  assert.equal(snap.sources.moved.ok, false);
  assert.match(snap.sources.moved.error, /^redirigée vers http:\/\/127\.0\.0\.1:\d+\/ /);
  assert.equal(snap.sources.moved.carriedOver, true);
  assert.deepEqual(Object.keys(snap.sources.moved.files), [K.exam], 'fichiers conservés, pas retirés');
  assert.equal(snap.sources.slash.ok, true);
  delete state.redirects['/page/moved'];
});

test('16. erreurs du script lui-même : code 1 et message clair (snapshot illisible laissé intact)', async () => {
  let r = await runRaw(['--sources', path.join(tmp, 'absent.json'), '--snapshot', snapFile]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /impossible de lire/);
  r = await runRaw(['--option-inconnue']);
  assert.equal(r.code, 1);
  const broken = path.join(tmp, 'snapshot-casse.json');
  await writeFile(broken, '{ pas du json');
  r = await run([], { snapshot: broken });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /pas un JSON valide/);
  assert.equal(await readFile(broken, 'utf8'), '{ pas du json');
  r = await runRaw(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--dry-run/);
});

// ---------------------------------------------------------------------------
// Fonctions pures
// ---------------------------------------------------------------------------

test('17. normalizeFileUrl : décode, retire paramètres et ancres, filtre ce qui n’est pas un document', () => {
  const page = 'https://pop.education.gov.il/tchumey_daat/x/y/';
  const n = (raw) => normalizeFileUrl(raw, page);
  assert.equal(n('https://meyda.education.gov.il/files/a.pdf?csrt=4046#p2'), 'https://meyda.education.gov.il/files/a.pdf');
  assert.equal(n('http://meyda.education.gov.il/files/a.pdf'), 'https://meyda.education.gov.il/files/a.pdf');
  assert.equal(n('http://example.org/a.pdf'), 'http://example.org/a.pdf');
  assert.equal(n('//meyda.education.gov.il/f/b.DOCX'), 'https://meyda.education.gov.il/f/b.DOCX');
  assert.equal(n('../../z/c.xls'), 'https://pop.education.gov.il/tchumey_daat/z/c.xls');
  assert.equal(n('/f/%D7%A9%D7%9C%D7%95%D7%9D%20%D7%A2%D7%95%D7%9C%D7%9D.pdf'), 'https://pop.education.gov.il/f/שלום עולם.pdf');
  assert.equal(n('/f/a%2Fb%25c%3Fd.pdf'), 'https://pop.education.gov.il/f/a%2Fb%25c%3Fd.pdf');
  for (const ext of ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']) assert.ok(n(`/f/x.${ext}`), ext);
  for (const raw of ['/f/x.html', '/f/x.jpg', '/f/x.pdf.html', '/f/x.pdfx', '/f/xpdf', '#haut', '', 'mailto:a@b.c', 'javascript:void(0)', 'tel:123', 'ftp://h/x.pdf', 'data:application/pdf;base64,AAA']) {
    assert.equal(n(raw), null, raw);
  }
});

test('18. extractFileLinks : guillemets, entités, <base>, ng-href, iframe ; ignore data-* fantômes et doublons', () => {
  const html = `<base href="/docs/">
    <a href='a.pdf'>1</a> <a href="b.docx?x=1&amp;v=2">2</a> <a href=c.xlsx>3</a>
    <a ng-href="d.pptx">4</a> <iframe src="e.PDF"></iframe> <a href="a.pdf#p2">doublon</a>
    <span data-sheets-hyperlink="https://meyda.education.gov.il/files/fantome.pdf">x</span>
    <a href="page.html">p</a> <img src="logo.png">`;
  const root = 'https://h.example/docs';
  assert.deepEqual(extractFileLinks(html, 'https://h.example/p/'), [`${root}/a.pdf`, `${root}/b.docx`, `${root}/c.xlsx`, `${root}/d.pptx`, `${root}/e.PDF`]);
  assert.equal(decodeEntities('a&amp;b &#39;x&#x27; &lt;&gt; &quot; &inconnue;'), `a&b 'x' <> " &inconnue;`);
});

test('19. buildSnapshot / compareSnapshots : une panne n’est jamais un retrait ; sans référence, pas d’alerte', () => {
  const meta = (etag) => ({ etag, lastModified: null, length: 1 });
  const prev = { generatedAt: 'avant', sources: { s1: { url: 'u1', ok: true, files: { f1: meta('"1"'), f2: meta('"2"') } } } };
  const sources = [
    { id: 's1', subject: 'math', url: 'u1' },
    { id: 's2', subject: 'math', url: 'u2' },
  ];
  const pages = new Map([
    ['s1', { ok: false, error: 'HTTP 500', urls: [] }],
    ['s2', { ok: true, urls: ['g1'] }],
  ]);
  const probes = new Map([['g1', { kind: 'ok', meta: meta('"g"') }]]);
  const { snapshot, sourceErrors } = buildSnapshot({ sources, prev, pages, probes, now: 'maintenant' });
  assert.deepEqual(snapshot.sources.s1, { url: 'u1', ok: false, error: 'HTTP 500', carriedOver: true, files: prev.sources.s1.files });
  assert.equal(sourceErrors.length, 1);
  const cmp = compareSnapshots(prev, snapshot);
  assert.equal(cmp.length, 1, 's1 en erreur n’est pas comparée');
  assert.deepEqual([cmp[0].id, cmp[0].baseline, cmp[0].added.length], ['s2', true, 0]);
  // URL de source modifiée : nouvelle référence, pas de cascade « ajouté/retiré »
  const moved = buildSnapshot({
    sources: [{ id: 's1', subject: 'math', url: 'u1-bis' }],
    prev,
    pages: new Map([['s1', { ok: true, urls: ['z'] }]]),
    probes: new Map([['z', { kind: 'ok', meta: meta('"z"') }]]),
    now: 'maintenant',
  });
  assert.equal(compareSnapshots(prev, moved.snapshot)[0].baseline, true);
});

test('20. renderReport : listes plafonnées pour rester sous la limite des issues GitHub', () => {
  const added = Array.from({ length: 5000 }, (_, i) => ({ url: `https://h.example/f/fichier-${i}.pdf`, meta: { etag: '"x"', lastModified: LM, length: 1000 + i } }));
  const comparison = [{ id: 's', baseline: false, before: 1, now: 5001, added, removed: [], modified: [] }];
  const report = renderReport({ sources: [{ id: 's', subject: 'math', url: 'https://h.example/' }], comparison, now: '2026-11-10T10:00:00Z' });
  assert.ok(report.length < 65000, `${report.length} caractères`);
  assert.match(report, /et 4960 autres/);
  assert.match(report, /Bilan : 5000 fichiers ajoutés, 0 modifié, 0 retiré/);
});

test('21. samePage : http/https, www, barre finale et casse sont la même page ; un autre chemin non', () => {
  assert.ok(samePage('https://pop.education.gov.il/a/b/', 'https://pop.education.gov.il/a/b'));
  assert.ok(samePage('http://pop.education.gov.il/a/b/', 'https://pop.education.gov.il/a/B/'));
  assert.ok(samePage('https://www.example.org/a', 'https://example.org/a/'));
  assert.ok(!samePage('https://pop.education.gov.il/a/b/', 'https://pop.education.gov.il/'));
  assert.ok(!samePage('https://pop.education.gov.il/a/b/', 'https://pop.education.gov.il/a/c/'));
  assert.ok(!samePage('https://pop.education.gov.il/a/', 'https://autre.example.org/a/'));
});

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------

await setup();
let passed = 0;
let failed = 0;
try {
  console.log('Tests de scripts/watch-ministry.mjs (hors ligne, serveur local)\n');
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`  ✔ ${name}`);
    } catch (err) {
      failed += 1;
      console.log(`  ✘ ${name}\n${String(err.stack ?? err).replace(/^/gm, '      ')}`);
    }
  }
} finally {
  await teardown();
}
console.log(`\n${passed} test(s) réussi(s), ${failed} échec(s).`);
process.exitCode = failed ? 1 : 0;
