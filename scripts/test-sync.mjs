// Tests de la synchronisation entre assistants (scripts/sync.mjs), dans des dépôts jetables : un « GitHub » local
// et une copie de travail pour Hermes, une pour Claude. Pas de réseau ; rien ne touche au vrai dépôt.
// Lancer : node --test scripts/test-sync.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDiff, blockedPaths } from './sync.mjs';

const SYNC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sync.mjs');

// Fausses valeurs fabriquées à l'exécution : ce fichier ne contient lui-même aucune valeur qui ressemble à un secret.
const FAKE = {
  anthropic: ['sk-ant', 'api03', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefgh'].join('-'),
  github: ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].join('_'),
  pem: ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '),
  eleven: ['sk', 'a1b2c3d4e5f6'.repeat(4)].join('_'),
  aws: ['AKIA', 'ABCDEFGHIJKLMNOP'].join(''),
  password: ['password', ' = "Zx9Qw8Er7Ty6Ui5Op4Aa"'].join(''),
};

const diffOf = (file, ...rows) => [
  `diff --git a/${file} b/${file}`, 'new file mode 100644', '--- /dev/null', `+++ b/${file}`,
  `@@ -0,0 +1,${rows.length} @@`, ...rows.map((r) => `+${r}`),
].join('\n');

// ---- Le garde-fou, sans git ------------------------------------------------------------------------------------

test('garde-fou : repère les secrets (bon fichier, bonne ligne) sans jamais répéter leur valeur', () => {
  const r = scanDiff(diffOf('notes.md', 'une ligne ordinaire', `clé : ${FAKE.anthropic}`, `jeton : ${FAKE.github}`,
    FAKE.pem, `ELEVEN = ${FAKE.eleven}`, `aws ${FAKE.aws}`, FAKE.password));
  assert.deepEqual(r.secrets.map((s) => s.line), [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(r.secrets.map((s) => s.label), [
    'clé Anthropic', 'jeton GitHub', 'clé privée', 'clé ElevenLabs', 'clé AWS', 'mot de passe ou jeton écrit en clair']);
  assert.ok(r.secrets.every((s) => s.file === 'notes.md'));
  const dump = JSON.stringify(r);
  for (const v of Object.values(FAKE)) assert.ok(!dump.includes(v));
});

test('garde-fou : numéros de ligne justes dans un diff à plusieurs blocs, seules les lignes ajoutées comptent', () => {
  const diff = [
    'diff --git a/a.js b/a.js', '--- a/a.js', '+++ b/a.js',
    '@@ -3,1 +3,0 @@', `-const ancien = "${FAKE.anthropic}";`,
    '@@ -10,0 +10,2 @@', '+const x = 1;', `+const y = "${FAKE.anthropic}";`,
    'diff --git a/b.js b/b.js', '--- a/b.js', '+++ b/b.js',
    '@@ -1 +1 @@', '-ancien', `+++ ceci est une ligne ajoutée qui commence par deux plus ${FAKE.github}`,
  ].join('\n');
  const r = scanDiff(diff);
  assert.deepEqual(r.secrets.map((s) => `${s.file}:${s.line}`), ['a.js:11', 'b.js:1']);
});

test('garde-fou : ignore les fausses valeurs, les lignes marquées et le code ordinaire', () => {
  const r = scanDiff(diffOf('src.js',
    "const KEY = 'sk-ant-api03-TESTKEY_abcdefghijklmnopqrstuvwxyz0123456789';",
    "const CLE = 'sk-ant-api03-CLE-FACTICE-POUR-TESTER-LE-FORMAT-0000000000';",
    `const ok = '${FAKE.anthropic}'; // sync-ignore`,
    '<input placeholder="sk-ant-...">',
    'const max_tokens = 2400; const tokens = 12;',
    "const token = process.env.TOKEN; const apiKey = i.value.trim();",
    'wrangler secret put ANTHROPIC_API_KEY'));
  assert.deepEqual(r.secrets, []);
});

test('garde-fou : signale une adresse e-mail personnelle, pas les adresses sans réponse ni d\'exemple', () => {
  const perso = ['prenom.nom', 'gmail.com'].join('@'); // fabriquée à l'exécution, comme les fausses clés
  const r = scanDiff(diffOf('doc.md', `écrire à ${perso}`, 'contact@example.org',
    'orphee26-Gab@users.noreply.github.com', 'pas une adresse : @mention et a@b'));
  assert.deepEqual(r.emails.map((e) => [e.line, e.address]), [[1, perso]]);
});

test('garde-fou : une ligne énorme est examinée vite', () => {
  const big = 'A'.repeat(400_000);
  const t0 = performance.now();
  const r = scanDiff(diffOf('data.json', big, `${big}@${big}`));
  assert.deepEqual(r.secrets, []);
  assert.ok(performance.now() - t0 < 1500, `trop lent : ${(performance.now() - t0).toFixed(0)} ms`);
});

test('fichiers interdits : .env, clés, bases de données, dossiers d\'élèves — mais pas .env.example', () => {
  const bad = blockedPaths(['.env', 'server/.env.local', 'cle.pem', 'a/b/sauvegarde.sqlite', 'data/students/liste.csv',
    'copies/copie1.jpg', 'Élèves/notes.csv', 'scan/page1.png', '.env.example', 'docs/copies.md', 'scripts/scanner.mjs',
    'js/views/study.js', 'reference/claude-version/index.html']);
  assert.deepEqual(bad.map((b) => b.file), ['.env', 'server/.env.local', 'cle.pem', 'a/b/sauvegarde.sqlite',
    'data/students/liste.csv', 'copies/copie1.jpg', 'Élèves/notes.csv', 'scan/page1.png']);
});

// ---- Avec git : un « GitHub » local et deux copies de travail ---------------------------------------------------

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} → ${r.stderr}`);
  return r.stdout.trim();
}

function sandbox() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-')));
  const remote = path.join(dir, 'github.git');
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  const write = (root, name, text) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  };
  const work = (name) => {
    const d = path.join(dir, name);
    git(dir, 'clone', '-q', remote, d);
    git(d, 'config', 'user.name', name);
    git(d, 'config', 'user.email', `${name}@example.org`);
    git(d, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    return d;
  };
  const seed = work('seed');
  write(seed, '.gitattributes', 'DECISIONS.md merge=union\n');
  write(seed, 'DECISIONS.md', '# Décisions\n\n- 2026-11-10 — première décision\n');
  write(seed, 'HANDOFF.md', '# État\n\nligne A\nligne B\nligne C\n');
  fs.mkdirSync(path.join(seed, 'scripts'));
  fs.copyFileSync(SYNC, path.join(seed, 'scripts/sync.mjs'));
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'départ');
  git(seed, 'push', '-q', 'origin', 'main');
  return {
    dir, remote, write, hermes: work('hermes'), claude: work('claude'),
    show: (file) => git(remote, 'show', `main:${file}`),
    subject: () => git(remote, 'log', '-1', '--format=%s', 'main'),
    done: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

function sync(cwd, args, env = {}) {
  const r = spawnSync(process.execPath, [path.join(cwd, 'scripts/sync.mjs'), ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, ASSISTANT: '', ...env },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

async function inSandbox(fn) {
  const sb = sandbox();
  try { await fn(sb); } finally { sb.done(); }
}

test('envoyer puis recevoir : le travail d\'un assistant arrive chez l\'autre, avec son nom devant le message', () => inSandbox((sb) => {
  sb.write(sb.hermes, 'notes.md', 'bonjour\n');
  const a = sync(sb.hermes, ['push', 'Ajout des notes']);
  assert.equal(a.code, 0, a.out);
  assert.match(a.out, /✅ Envoyé sur GitHub/);
  assert.equal(sb.subject(), '[Hermes] Ajout des notes');

  const b = sync(sb.claude, ['pull'], { ASSISTANT: 'Claude' });
  assert.equal(b.code, 0, b.out);
  assert.match(b.out, /Reçu de l'autre côté/);
  assert.match(b.out, /\[Hermes\] Ajout des notes/);
  assert.equal(fs.readFileSync(path.join(sb.claude, 'notes.md'), 'utf8'), 'bonjour\n');

  assert.match(sync(sb.claude, ['pull']).out, /Rien de nouveau/);
  assert.match(sync(sb.claude, ['status']).out, /Tout est synchronisé/);
}));

test('le nom de l\'assistant n\'est pas ajouté deux fois', () => inSandbox((sb) => {
  sb.write(sb.claude, 'a.md', 'a\n');
  assert.equal(sync(sb.claude, ['push', '[Claude] Déjà préfixé'], { ASSISTANT: 'Claude' }).code, 0);
  assert.equal(sb.subject(), '[Claude] Déjà préfixé');
}));

test('deux assistants ajoutent une ligne à DECISIONS.md en même temps : les deux lignes sont gardées', () => inSandbox((sb) => {
  const add = (root, line) => fs.appendFileSync(path.join(root, 'DECISIONS.md'), `${line}\n`);
  add(sb.hermes, '- 2026-11-12 — décision notée par Hermes');
  assert.equal(sync(sb.hermes, ['push', 'Décision Hermes']).code, 0);
  add(sb.claude, '- 2026-11-12 — décision notée par Claude');
  const r = sync(sb.claude, ['push', 'Décision Claude'], { ASSISTANT: 'Claude' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /L'autre assistant avait envoyé entre-temps/);
  const text = sb.show('DECISIONS.md');
  for (const part of ['première décision', 'notée par Hermes', 'notée par Claude']) assert.ok(text.includes(part), part);
  assert.ok(!text.includes('<<<<<<<'));
}));

test('vrai conflit : rien n\'est écrasé ni envoyé, le dossier est remis en ordre, code 2', () => inSandbox((sb) => {
  const edit = (root, who) => fs.writeFileSync(path.join(root, 'HANDOFF.md'), `# État\n\nligne A\nligne B (${who})\nligne C\n`);
  edit(sb.hermes, 'Hermes');
  assert.equal(sync(sb.hermes, ['push', 'Modif Hermes']).code, 0);
  edit(sb.claude, 'Claude');
  const r = sync(sb.claude, ['push', 'Modif Claude'], { ASSISTANT: 'Claude' });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /Conflit avec le travail de l'autre assistant dans : HANDOFF\.md/);
  assert.ok(!fs.existsSync(path.join(sb.claude, '.git/rebase-merge')) && !fs.existsSync(path.join(sb.claude, '.git/rebase-apply')));
  assert.equal(git(sb.claude, 'status', '--porcelain'), '');
  assert.equal(git(sb.claude, 'log', '-1', '--format=%s'), '[Claude] Modif Claude');
  assert.match(fs.readFileSync(path.join(sb.claude, 'HANDOFF.md'), 'utf8'), /ligne B \(Claude\)/);
  assert.match(sb.show('HANDOFF.md'), /ligne B \(Hermes\)/);
  assert.ok(!sb.show('HANDOFF.md').includes('Claude'));
}));

test('secret : refus, rien d\'enregistré ni d\'envoyé, la valeur n\'est pas répétée', () => inSandbox((sb) => {
  sb.write(sb.claude, 'notes/secret.md', `ma clé : ${FAKE.anthropic}\n`);
  const r = sync(sb.claude, ['push', 'Notes'], { ASSISTANT: 'Claude' });
  assert.equal(r.code, 1);
  assert.match(r.out, /ressemble à un secret/);
  assert.match(r.out, /notes\/secret\.md:1 — clé Anthropic/);
  assert.ok(!r.out.includes(FAKE.anthropic));
  assert.equal(git(sb.claude, 'diff', '--cached', '--name-only'), '');
  assert.equal(git(sb.claude, 'rev-list', '--count', 'HEAD'), '1');
  assert.equal(git(sb.remote, 'rev-list', '--count', 'main'), '1');
}));

test('fichiers interdits : refus, rien d\'enregistré', () => inSandbox((sb) => {
  sb.write(sb.hermes, 'data/students/liste.csv', 'nom,note\n');
  sb.write(sb.hermes, 'cle.pem', 'x\n');
  const r = sync(sb.hermes, ['push', 'Données']);
  assert.equal(r.code, 1);
  assert.match(r.out, /data\/students\/liste\.csv \(dossier de données d'élèves\)/);
  assert.match(r.out, /cle\.pem \(clé ou certificat\)/);
  assert.equal(git(sb.hermes, 'diff', '--cached', '--name-only'), '');
  assert.equal(git(sb.remote, 'rev-list', '--count', 'main'), '1');
}));

test('retirer un fichier interdit déjà enregistré par erreur reste possible', () => inSandbox((sb) => {
  sb.write(sb.hermes, 'data/students/liste.csv', 'nom,note\n');
  git(sb.hermes, 'add', '-A');
  git(sb.hermes, 'commit', '-q', '-m', 'erreur');
  git(sb.hermes, 'push', '-q', 'origin', 'main');
  fs.rmSync(path.join(sb.hermes, 'data'), { recursive: true });
  const r = sync(sb.hermes, ['push', 'Retrait du fichier']);
  assert.equal(r.code, 0, r.out);
  assert.throws(() => sb.show('data/students/liste.csv'));
}));

test('message obligatoire quand il y a quelque chose à enregistrer, inutile sinon', () => inSandbox((sb) => {
  sb.write(sb.hermes, 'a.md', 'a\n');
  const r = sync(sb.hermes, ['push']);
  assert.equal(r.code, 1);
  assert.match(r.out, /Il faut un message/);
  assert.equal(git(sb.hermes, 'diff', '--cached', '--name-only'), '');
  const ok = sync(sb.claude, ['push']);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /Rien de nouveau à enregistrer/);
}));

test('recevoir avec des changements non enregistrés : refus, rien n\'est modifié', () => inSandbox((sb) => {
  fs.writeFileSync(path.join(sb.hermes, 'HANDOFF.md'), 'brouillon non enregistré\n');
  const r = sync(sb.hermes, ['pull']);
  assert.equal(r.code, 1);
  assert.match(r.out, /pas encore enregistrés/);
  assert.equal(fs.readFileSync(path.join(sb.hermes, 'HANDOFF.md'), 'utf8'), 'brouillon non enregistré\n');
}));

test('envoi rejeté une fois par GitHub : une seule nouvelle tentative, qui réussit', () => inSandbox((sb) => {
  const marker = path.join(sb.remote, 'rejete-une-fois');
  fs.writeFileSync(path.join(sb.remote, 'hooks/pre-receive'),
    `#!/bin/sh\nif [ ! -f "${marker}" ]; then touch "${marker}"; echo "rejet simulé" >&2; exit 1; fi\n`, { mode: 0o755 });
  sb.write(sb.hermes, 'a.md', 'a\n');
  const r = sync(sb.hermes, ['push', 'Avec rejet']);
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(marker), 'le premier envoi aurait dû être rejeté');
  assert.equal(sb.subject(), '[Hermes] Avec rejet');
}));

test('envoi refusé définitivement : code 1 et message clair, sans force', () => inSandbox((sb) => {
  fs.writeFileSync(path.join(sb.remote, 'hooks/pre-receive'), '#!/bin/sh\necho "branche protégée" >&2\nexit 1\n', { mode: 0o755 });
  sb.write(sb.hermes, 'a.md', 'a\n');
  const r = sync(sb.hermes, ['push', 'Refusé']);
  assert.equal(r.code, 1);
  assert.match(r.out, /GitHub a refusé l'envoi/);
  assert.equal(git(sb.remote, 'rev-list', '--count', 'main'), '1');
  assert.equal(git(sb.hermes, 'log', '-1', '--format=%s'), '[Hermes] Refusé'); // le travail reste enregistré en local
}));

test('commande inconnue : mode d\'emploi, code 1 ; le script ne force jamais', () => {
  const r = spawnSync(process.execPath, [SYNC, 'danse'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage/);
  const source = fs.readFileSync(SYNC, 'utf8');
  assert.ok(!/--force|--force-with-lease|push['"],\s*['"]-f/.test(source));
});
