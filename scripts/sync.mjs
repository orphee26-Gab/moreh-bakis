#!/usr/bin/env node
// Synchronisation du dépôt entre les deux assistants (Claude et Hermes) : tirer, vérifier, enregistrer, envoyer.
//
//   node scripts/sync.mjs pull              début de séance : tire ce que l'autre a envoyé et le résume
//   node scripts/sync.mjs push "message"    enregistre tout, refuse d'envoyer un secret, tire, envoie
//   node scripts/sync.mjs status            où en sont ce dossier et GitHub
//
// ASSISTANT=Claude (par défaut : Hermes) : nom placé devant le message d'enregistrement.
// Ne force jamais. En cas de conflit avec le travail de l'autre assistant, rien n'est écrasé et rien n'est envoyé.
// Codes de sortie : 0 réussi · 1 refusé (secret, fichier interdit, changements non enregistrés, réseau…) · 2 conflit.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRANCH = 'main';
const FALLBACK = { name: 'orphee26-Gab', email: 'orphee26-Gab@users.noreply.github.com' };
const USAGE = [
  'Usage :',
  "  node scripts/sync.mjs pull             début de séance : tire et résume ce que l'autre a envoyé",
  "  node scripts/sync.mjs push \"message\"   enregistre, vérifie qu'aucun secret ne part, tire, envoie",
  '  node scripts/sync.mjs status           état local et GitHub',
].join('\n');

// ---- Garde-fou : ce qui ne doit jamais entrer dans ce dépôt public ----------------------------------------------

const SECRETS = [
  ['clé Anthropic', /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ['clé ElevenLabs', /\bsk_[a-f0-9]{40,}\b/g],
  ['jeton GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['clé AWS', /\bAKIA[0-9A-Z]{16}\b/g],
  ['clé Google', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['clé privée', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['mot de passe ou jeton écrit en clair', /\b(?:api[_-]?key|secret|passw(?:or)?d|token)\b["']?\s*[:=]\s*["'][A-Za-z0-9_\-\/+=.]{16,}["']/gi],
];
// Valeurs visiblement fausses (tests, exemples) : jamais signalées.
const HARMLESS = /test|factice|fake|exemple|example|xxxx|0000|votre|your/i;
const EMAIL_OK = /noreply|no-reply|example\.|localhost/i;
const FORBIDDEN = [
  [/(^|\/)\.env(\.(?!example$|sample$)[^/]*)?$/, 'fichier .env'],
  [/\.(pem|key|p12|pfx)$/i, 'clé ou certificat'],
  [/\.(sqlite3?|db)$/i, 'base de données'],
  [/(^|\/)(students?|student-data|[ée]l[èe]ves?|copies?|scans?)(\/|$)/i, "dossier de données d'élèves"],
];

// Adresses e-mail d'une ligne. Recherche autour de chaque « @ » (longueur bornée) : reste rapide sur une ligne énorme.
function findEmails(text) {
  const found = [];
  for (let at = text.indexOf('@'); at !== -1; at = text.indexOf('@', at + 1)) {
    const left = /[A-Za-z0-9._%+-]{1,64}$/.exec(text.slice(Math.max(0, at - 64), at));
    const right = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/.exec(text.slice(at + 1, at + 256));
    if (left && right) found.push(`${left[0]}@${right[0]}`);
  }
  return found;
}

// Examine les lignes AJOUTÉES d'un diff (git diff -U0). Ne renvoie jamais la valeur trouvée, seulement où elle est.
export function scanDiff(diff) {
  const secrets = [];
  const emails = [];
  let file = '?';
  let line = 0;
  let inHunk = false;
  for (const raw of String(diff).split('\n')) {
    if (raw.startsWith('diff --git ')) { inHunk = false; continue; }
    if (!inHunk && raw.startsWith('+++ ')) { file = raw.slice(4).replace(/\t.*$/, '').replace(/^b\//, ''); continue; }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { inHunk = true; line = Number(hunk[1]) - 1; continue; }
    if (!inHunk || !raw.startsWith('+')) continue;
    line += 1;
    const text = raw.slice(1);
    if (text.includes('sync-ignore')) continue;
    for (const [label, re] of SECRETS) {
      for (const m of text.matchAll(re)) if (!HARMLESS.test(m[0])) secrets.push({ file, line, label });
    }
    for (const address of findEmails(text)) if (!EMAIL_OK.test(address)) emails.push({ file, line, address });
  }
  return { secrets, emails };
}

export function blockedPaths(files) {
  const out = [];
  for (const file of files) {
    for (const [re, why] of FORBIDDEN) if (re.test(file)) { out.push({ file, why }); break; }
  }
  return out;
}

// ---- Git -------------------------------------------------------------------------------------------------------

class Stop extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const stop = (code, ...lines) => { throw new Stop(code, lines.join('\n')); };
const say = (text = '') => console.log(text);
const indent = (text) => text.split('\n').map((l) => `   ${l}`).join('\n');
const count = (text) => Number.parseInt(text, 10) || 0;
const lines = (text) => text.split('\n').filter(Boolean);

function rawGit(args, env = process.env) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024 });
  return { code: r.status ?? 1, out: (r.stdout || '').replace(/\s+$/, ''), err: (r.stderr || '').replace(/\s+$/, '') };
}
let gitEnv;
// Si aucune identité git n'est configurée, une identité neutre est utilisée (jamais une adresse personnelle).
function git(...args) {
  if (!gitEnv) {
    const name = rawGit(['config', 'user.name']).out;
    const email = rawGit(['config', 'user.email']).out;
    gitEnv = name && email ? process.env : {
      ...process.env,
      GIT_AUTHOR_NAME: name || FALLBACK.name, GIT_COMMITTER_NAME: name || FALLBACK.name,
      GIT_AUTHOR_EMAIL: email || FALLBACK.email, GIT_COMMITTER_EMAIL: email || FALLBACK.email,
    };
  }
  return rawGit(args, gitEnv);
}

function ensureRepo() {
  if (rawGit(['rev-parse', '--is-inside-work-tree']).out !== 'true') stop(1, "❌ Ce dossier n'est pas un dépôt git.");
  if (rawGit(['remote', 'get-url', 'origin']).code !== 0) stop(1, "❌ Le dépôt n'a pas de remote « origin ».");
}
const unsaved = () => lines(git('status', '--porcelain').out);

function fetchMain() {
  const r = git('fetch', 'origin', BRANCH);
  if (r.code !== 0) stop(1, '❌ GitHub est injoignable (réseau, connexion ou droits) :', r.err);
}

// Rejoue le travail local par-dessus celui de GitHub. Au moindre conflit : tout est annulé, rien n'est écrasé.
function rebase() {
  const r = git('pull', '--rebase', 'origin', BRANCH);
  if (r.code === 0) return;
  const files = lines(git('diff', '--name-only', '--diff-filter=U').out);
  git('rebase', '--abort');
  if (!files.length) stop(1, '❌ La mise à jour depuis GitHub a échoué :', r.err || r.out);
  stop(2,
    `⚠️ Conflit avec le travail de l'autre assistant dans : ${files.join(', ')}`,
    "Rien n'a été écrasé ni envoyé : ton enregistrement local est conservé et le dossier est revenu à son état d'avant.",
    'À faire : le dire à Gabriel. Pour comparer : git diff HEAD origin/main -- <fichier>');
}

// ---- Commandes -------------------------------------------------------------------------------------------------

function pull() {
  ensureRepo();
  const dirty = unsaved();
  if (dirty.length) {
    stop(1, '❌ Des changements ne sont pas encore enregistrés :', ...dirty.slice(0, 10).map((l) => `   ${l}`),
      'Les enregistrer d\'abord : node scripts/sync.mjs push "message"');
  }
  fetchMain();
  const before = git('rev-parse', 'HEAD').out;
  const incoming = git('log', '--format=%h · %an · %ad · %s', '--date=short', `HEAD..origin/${BRANCH}`).out;
  if (!incoming) {
    say("✅ Rien de nouveau : l'autre assistant n'a rien envoyé depuis la dernière synchronisation.");
  } else {
    say("📥 Reçu de l'autre côté :");
    say(indent(incoming));
    say();
    say(git('diff', '--stat=100', `HEAD...origin/${BRANCH}`).out.split('\n').slice(-25).join('\n'));
    rebase();
    const added = git('diff', '-U0', '--no-color', before, 'HEAD', '--', 'DECISIONS.md').out
      .split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    if (added.length) {
      say('\n📝 Nouvelles lignes dans DECISIONS.md :');
      for (const l of added) say(`   ${l.slice(1)}`);
    }
    const touched = lines(git('diff', '--name-only', before, 'HEAD').out);
    const states = ['HANDOFF.md', 'CLAUDE-HANDOFF.md'].filter((f) => touched.includes(f));
    if (states.length) say(`\n🔔 À relire : ${states.join(', ')}`);
  }
  const ahead = count(git('rev-list', '--count', `origin/${BRANCH}..HEAD`).out);
  if (ahead) say(`\n↑ ${ahead} enregistrement(s) local(aux) pas encore envoyé(s).`);
  say('\n📖 Début de séance : lire HANDOFF.md, CLAUDE-HANDOFF.md et DECISIONS.md.');
}

function push(message) {
  ensureRepo();
  if (git('diff', '--name-only', '--diff-filter=U').out) stop(1, "❌ Un conflit n'est pas résolu : voir git status.");
  const who = (process.env.ASSISTANT || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 30) || 'Hermes';
  git('add', '-A');
  const staged = git('diff', '--cached', '--name-only', '-z').out.split('\0').filter(Boolean);
  if (staged.length) {
    const unstage = () => git('reset', '-q');
    const text = message.trim();
    if (!text) { unstage(); stop(1, '❌ Il faut un message. Exemple : node scripts/sync.mjs push "Faculté : ajout de Bar-Ilan"'); }
    // Supprimer un fichier interdit déjà enregistré doit rester possible : seuls les fichiers ajoutés ou modifiés comptent.
    const kept = git('diff', '--cached', '--name-only', '-z', '--diff-filter=d').out.split('\0').filter(Boolean);
    const bad = blockedPaths(kept);
    if (bad.length) {
      unstage();
      stop(1, '❌ Envoi refusé : fichier qui ne doit pas entrer dans ce dépôt public.',
        ...bad.map((b) => `   ${b.file} (${b.why})`),
        "Rien n'a été enregistré. Sortir ces fichiers du dossier du projet (ou les déclarer dans .gitignore), puis recommencer.");
    }
    const found = scanDiff(git('diff', '--cached', '-U0', '--no-color').out);
    if (found.secrets.length) {
      unstage();
      stop(1, '❌ Envoi refusé : ce qui suit ressemble à un secret (clé, jeton ou mot de passe).',
        ...found.secrets.map((s) => `   ${s.file}:${s.line} — ${s.label}`),
        "Rien n'a été enregistré. Mettre la valeur dans .env (ignoré par git) et la lire depuis le code.",
        "Si c'est une fausse valeur d'exemple, y écrire « test » ou « fake » ; si la ligne est inoffensive, y ajouter « sync-ignore » en commentaire.");
    }
    for (const e of found.emails) say(`⚠️ Adresse e-mail dans ${e.file}:${e.line} (${e.address}) : vérifier qu'elle peut être publique.`);
    const full = /^\[[^\]]+\]/.test(text) ? text : `[${who}] ${text}`;
    const c = git('commit', '-q', '-m', full);
    if (c.code !== 0) stop(1, '❌ Enregistrement impossible :', c.err || c.out);
    say(`✅ Enregistré : ${git('log', '-1', '--format=%h %s').out}`);
  } else {
    say('Rien de nouveau à enregistrer.');
  }

  fetchMain();
  const incoming = git('log', '--format=%h · %an · %s', `HEAD..origin/${BRANCH}`).out;
  if (incoming) {
    say("📥 L'autre assistant avait envoyé entre-temps :");
    say(indent(incoming));
  }
  rebase();
  const ahead = count(git('rev-list', '--count', `origin/${BRANCH}..HEAD`).out);
  if (!ahead) { say('✅ GitHub est déjà à jour.'); return; }
  let p = git('push', 'origin', `HEAD:${BRANCH}`);
  if (p.code !== 0) { // un envoi est passé entre-temps : une seule nouvelle tentative, jamais de force
    fetchMain();
    rebase();
    p = git('push', 'origin', `HEAD:${BRANCH}`);
  }
  if (p.code !== 0) stop(1, "❌ GitHub a refusé l'envoi :", p.err || p.out);
  say(`✅ Envoyé sur GitHub : ${git('rev-parse', '--short', 'HEAD').out} (${ahead} enregistrement${ahead > 1 ? 's' : ''}).`);
}

function status() {
  ensureRepo();
  fetchMain();
  const ahead = count(git('rev-list', '--count', `origin/${BRANCH}..HEAD`).out);
  const behind = count(git('rev-list', '--count', `HEAD..origin/${BRANCH}`).out);
  const dirty = unsaved();
  say(`Branche ${git('branch', '--show-current').out} · ici ${git('rev-parse', '--short', 'HEAD').out} · GitHub ${git('rev-parse', '--short', `origin/${BRANCH}`).out}`);
  say(`↑ ${ahead} à envoyer · ↓ ${behind} à recevoir · ${dirty.length} fichier(s) non enregistré(s)`);
  if (behind) say('→ Lancer : node scripts/sync.mjs pull');
  else if (ahead || dirty.length) say('→ Lancer : node scripts/sync.mjs push "message"');
  else say('✅ Tout est synchronisé.');
}

export function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === 'pull') pull();
    else if (cmd === 'push') push(rest.join(' '));
    else if (cmd === 'status') status();
    else stop(1, USAGE);
    return 0;
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    console.error(e.message);
    return e.code;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) process.exitCode = main();
