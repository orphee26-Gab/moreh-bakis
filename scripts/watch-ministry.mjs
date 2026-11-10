#!/usr/bin/env node
/**
 * Surveillance des pages du ministère de l'Éducation (pop.education.gov.il).
 *
 * Pour chaque source de data/sources.json :
 *   1. GET de la page (aucune lecture de page si l'URL est déjà un document) ;
 *   2. extraction de tous les liens vers .pdf .doc .docx .xls .xlsx .ppt .pptx
 *      (URLs absolues, décodées, sans paramètres de cache ni ancre) ;
 *   3. HEAD sur chaque fichier (repli : GET avec « Range: bytes=0-0 » si le HEAD est refusé)
 *      pour relever etag, last-modified et content-length.
 * Le résultat est comparé au snapshot précédent : fichiers ajoutés, retirés, modifiés.
 *
 * Règles de robustesse :
 *   - une source en erreur (réseau, HTTP ≠ 2xx, page redirigée ailleurs) est signalée comme erreur, JAMAIS comme
 *     « fichiers retirés » : son état précédent est conservé tel quel dans le nouveau snapshot ;
 *   - un fichier momentanément illisible (réseau, 5xx, 403…) garde sa dernière valeur connue
 *     et n'est jamais « modifié » ; seuls 404 et 410 sont enregistrés (champ `status`) ;
 *   - les en-têtes sont demandés sans compression (Accept-Encoding: identity) ; un en-tête absent
 *     d'une lecture (CDN capricieux) n'est jamais comparé, et ETag faible/fort sont équivalents ;
 *   - première exécution (ou nouvelle source) : la référence est écrite, aucune alerte.
 *
 * Sortie : s'il y a des changements, un rapport Markdown en français est écrit dans --diff et
 * `changed=true` dans le fichier $GITHUB_OUTPUT (sinon `changed=false`).
 * Code de sortie 0, sauf erreur du script lui-même (option invalide, fichier illisible…).
 *
 * Node >= 20, aucune dépendance (fetch natif).
 *
 * Usage : node scripts/watch-ministry.mjs [--sources f] [--snapshot f] [--diff f] [--dry-run]
 *         (voir --help pour les réglages réseau, utilisés surtout par les tests)
 */
import { appendFileSync, realpathSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';

export const USER_AGENT = 'moreh-bakis-watch/1.0 (+https://github.com/orphee26-Gab/moreh-bakis)';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC_EXT = /\.(?:pdf|docx?|xlsx?|pptx?)$/i;
const EDU_HOST = /(?:^|\.)education\.gov\.il$/i;
const HEAD_REFUSED = new Set([400, 401, 403, 405, 501]); // HEAD refusé -> GET Range
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const GONE_STATUS = new Set([404, 410]); // seuls statuts d'erreur enregistrés pour un fichier
// Sans « identity », le CDN (CloudFront) compresse les PDF à la volée : il retire alors Content-Length,
// transforme l'ETag en validateur faible (W/"…") et les valeurs changent d'une requête à l'autre.
const FILE_HEADERS = { 'Accept-Encoding': 'identity' };
const MAX_ITEMS = 40; // lignes maximum par liste dans le rapport
const MAX_REPORT_CHARS = 60000; // une issue GitHub accepte 65 536 caractères

export const SUBJECT_LABELS = {
  math: 'Mathématiques',
  physics: 'Physique',
  history: 'Histoire',
  tanakh: 'Tanakh (Bible)',
  hebrew: 'Hébreu (langue)',
  english: 'Anglais',
  bagrut: 'Bagrout (conditions générales)',
};

const USAGE = `Usage : node scripts/watch-ministry.mjs [options]

  --sources <fichier>   liste des pages à surveiller   (défaut : data/sources.json)
  --snapshot <fichier>  référence précédente et nouvelle (défaut : data/ministry-snapshot.json)
  --diff <fichier>      rapport Markdown des changements (défaut : data/ministry-diff.md)
  --dry-run             interroge le site mais n'écrit aucun fichier (rapport affiché)
  --concurrency <n>     requêtes simultanées            (défaut : 4)
  --pause-ms <n>        pause après chaque requête      (défaut : 250)
  --timeout-ms <n>      délai par requête               (défaut : 30000)
  --retries <n>         nouvelles tentatives            (défaut : 2)
  --retry-delay-ms <n>  attente avant une nouvelle tentative, multipliée par le rang (défaut : 2000)
  -h, --help            affiche cette aide
`;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function describeError(err) {
  if (!err) return 'erreur inconnue';
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'délai dépassé';
  const code = err.cause?.code ?? err.code;
  if (code) return `erreur réseau (${code})`;
  return err.message || String(err);
}

async function cancelBody(res) {
  try {
    await res.body?.cancel();
  } catch {
    /* sans importance : on ne lit pas le corps */
  }
}

async function writeAtomic(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
}

function sortedObject(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// ---------------------------------------------------------------------------
// Extraction des liens vers des fichiers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (match, dec, hex, name) => {
    try {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
    } catch {
      return match;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? match;
  });
}

function decodeSegment(segment) {
  try {
    // On décode (hébreu lisible) mais on garde encodés les caractères qui changeraient le sens de l'URL.
    return decodeURIComponent(segment).replace(/[%?#/]/g, (c) => encodeURIComponent(c));
  } catch {
    return segment;
  }
}

/**
 * Transforme un lien brut en identifiant de fichier : URL absolue, chemin décodé, sans paramètres
 * (de cache ou autres) ni ancre. Renvoie null si ce n'est pas un lien http(s) vers un document.
 * Les liens http vers *.education.gov.il sont ramenés en https (le site redirige de toute façon).
 */
export function normalizeFileUrl(raw, base) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.protocol === 'http:' && EDU_HOST.test(url.hostname)) url.protocol = 'https:';
  const pathname = url.pathname.split('/').map(decodeSegment).join('/');
  if (!DOC_EXT.test(pathname)) return null;
  return `${url.protocol}//${url.host}${pathname}`;
}

/** Tous les liens vers des documents d'une page HTML (triés, sans doublon). */
export function extractFileLinks(html, pageUrl) {
  let base = pageUrl;
  const baseTag = /<base\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(html);
  if (baseTag) {
    try {
      base = new URL(decodeEntities(baseTag[1] ?? baseTag[2] ?? baseTag[3]), pageUrl).href;
    } catch {
      /* <base> invalide : ignoré */
    }
  }
  const found = new Set();
  // href / ng-href / src (iframe, embed) / data (object) ; les data-* « fantômes » (copier-coller
  // de Google Sheets, par exemple) ne sont volontairement pas lus.
  const attribute = /\b(?:href|ng-href|src|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/gi;
  for (const match of html.matchAll(attribute)) {
    const key = normalizeFileUrl(decodeEntities(match[1] ?? match[2] ?? match[3] ?? ''), base);
    if (key) found.add(key);
  }
  return [...found].sort();
}

// ---------------------------------------------------------------------------
// Réseau
// ---------------------------------------------------------------------------

function retryAfterMs(value, fallback) {
  const seconds = Number(value);
  if (value && Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);
  return fallback;
}

/**
 * fetch avec délai, nouvelles tentatives (erreurs réseau, 408/425/429/5xx) et traitement du corps
 * à l'intérieur de la tentative (une lenteur de lecture est donc aussi retentée).
 */
async function fetchWithRetry(url, init, cfg, onResponse) {
  let lastError;
  let wait = 0;
  for (let attempt = 0; attempt <= cfg.retries; attempt++) {
    if (attempt > 0) await sleep(wait);
    try {
      const res = await fetch(url, {
        method: init.method ?? 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT, ...init.headers },
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (RETRY_STATUS.has(res.status) && attempt < cfg.retries) {
        lastError = new Error(`HTTP ${res.status}`);
        wait = retryAfterMs(res.headers.get('retry-after'), cfg.retryDelayMs * (attempt + 1));
        await cancelBody(res);
        continue;
      }
      return await onResponse(res);
    } catch (err) {
      lastError = err;
      wait = cfg.retryDelayMs * (attempt + 1);
    }
  }
  throw lastError;
}

/** Même page, malgré http→https, « www. », barre finale ou casse ? Sinon la redirection mène ailleurs. */
export function samePage(requested, final) {
  try {
    const a = new URL(requested);
    const b = new URL(final);
    const host = (u) => u.hostname.toLowerCase().replace(/^www\./, '');
    const pathOf = (u) => u.pathname.replace(/\/+$/, '').toLowerCase();
    return host(a) === host(b) && pathOf(a) === pathOf(b);
  } catch {
    return requested === final;
  }
}

async function fetchPage(url, cfg) {
  try {
    return await fetchWithRetry(
      url,
      { headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' } },
      cfg,
      async (res) => {
        if (!res.ok) {
          await cancelBody(res);
          return { ok: false, error: `HTTP ${res.status}` };
        }
        const finalUrl = res.url || url;
        if (!samePage(url, finalUrl)) {
          // Le portail renvoie vers l'accueil (302, puis 200) quand une page est déplacée ou supprimée :
          // lire l'accueil donnerait « 0 fichier » et tout passerait pour retiré. C'est une erreur de source.
          await cancelBody(res);
          return { ok: false, error: `redirigée vers ${finalUrl} (page déplacée ou supprimée ?)` };
        }
        return { ok: true, html: await res.text(), finalUrl };
      },
    );
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

function metaFromHeaders(headers) {
  const length = headers.get('content-length');
  return {
    etag: headers.get('etag') ?? null,
    lastModified: headers.get('last-modified') ?? null,
    length: length !== null && /^\d+$/.test(length.trim()) ? Number(length) : null,
  };
}

function classifyStatus(status) {
  if (GONE_STATUS.has(status)) return { kind: 'status', status };
  return { kind: 'error', error: `HTTP ${status}` };
}

/** Interprète la réponse d'un GET « Range: bytes=0-0 » (taille réelle lue dans Content-Range). */
function interpretRange({ status, headers }) {
  const range = headers.get('content-range') ?? '';
  if (status === 206) {
    const total = /\/(\d+)\s*$/.exec(range);
    return {
      kind: 'ok',
      meta: {
        etag: headers.get('etag') ?? null,
        lastModified: headers.get('last-modified') ?? null,
        length: total ? Number(total[1]) : null,
      },
    };
  }
  if (status === 200) return { kind: 'ok', meta: metaFromHeaders(headers) }; // Range ignoré : taille complète
  if (status === 416) {
    const empty = /\*\/(\d+)\s*$/.exec(range); // fichier vide
    if (empty) return { kind: 'ok', meta: { ...metaFromHeaders(headers), length: Number(empty[1]) } };
  }
  return classifyStatus(status);
}

/** HEAD, puis GET Range si le HEAD est refusé. Résultat : {kind:'ok',meta} | {kind:'status',status} | {kind:'error',error}. */
export async function probeFile(url, cfg) {
  try {
    const head = await fetchWithRetry(url, { method: 'HEAD', headers: FILE_HEADERS }, cfg, async (res) => ({
      status: res.status,
      headers: res.headers,
    }));
    if (head.status >= 200 && head.status < 300) return { kind: 'ok', meta: metaFromHeaders(head.headers) };
    if (!HEAD_REFUSED.has(head.status)) return classifyStatus(head.status);
    const got = await fetchWithRetry(url, { method: 'GET', headers: { ...FILE_HEADERS, Range: 'bytes=0-0' } }, cfg, async (res) => {
      const out = { status: res.status, headers: res.headers };
      await cancelBody(res); // on ne télécharge jamais le fichier
      return out;
    });
    return interpretRange(got);
  } catch (err) {
    return { kind: 'error', error: describeError(err) };
  }
}

async function runPool(items, cfg, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(cfg.concurrency, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        results[i] = { kind: 'error', error: describeError(err) };
      }
      if (cfg.pauseMs > 0) await sleep(cfg.pauseMs);
    }
  });
  await Promise.all(lanes);
  return results;
}

// ---------------------------------------------------------------------------
// Snapshot et comparaison
// ---------------------------------------------------------------------------

/** Une source a une référence exploitable si elle a déjà été lue (ou conservée) avec la même URL. */
function hasBaseline(old, url) {
  return Boolean(old) && old.url === url && (old.ok === true || old.carriedOver === true);
}

/** Si rien de défini n'a changé depuis la lecture précédente, on garde l'union des valeurs connues (snapshot stable). */
function mergeMeta(old, fresh) {
  if (!old || old.status || diffMeta(old, fresh).length > 0) return fresh;
  return {
    etag: old.etag ?? fresh.etag ?? null,
    lastModified: old.lastModified ?? fresh.lastModified ?? null,
    length: old.length ?? fresh.length ?? null,
  };
}

/**
 * Construit le nouveau snapshot.
 *  pages  : Map id -> {ok, error?, single?, urls[]}
 *  probes : Map url -> résultat de probeFile
 */
export function buildSnapshot({ sources, prev, pages, probes, now }) {
  const snapshot = { generatedAt: now, sources: {} };
  const sourceErrors = [];
  const fileErrors = [];
  for (const source of sources) {
    const old = prev?.sources?.[source.id];
    const baseline = hasBaseline(old, source.url);
    const page = pages.get(source.id) ?? { ok: false, error: 'source non interrogée', urls: [] };
    let failure = page.ok ? null : page.error;
    const files = {};
    if (!failure) {
      for (const url of page.urls) {
        const probe = probes.get(url) ?? { kind: 'error', error: 'fichier non vérifié' };
        const known = baseline ? old.files?.[url] : undefined;
        if (probe.kind === 'ok') {
          const fresh = { etag: probe.meta.etag ?? null, lastModified: probe.meta.lastModified ?? null, length: probe.meta.length ?? null };
          files[url] = mergeMeta(known, fresh);
        } else if (page.single) {
          // Source = un document unique : s'il est illisible, c'est la source qui est en erreur.
          failure = probe.kind === 'status' ? `HTTP ${probe.status}` : probe.error;
        } else if (probe.kind === 'status') {
          files[url] = { etag: null, lastModified: null, length: null, status: probe.status };
        } else {
          if (known) files[url] = known; // dernière valeur connue : pas de faux « modifié »
          fileErrors.push({ id: source.id, url, error: probe.error, kept: Boolean(known) });
        }
      }
    }
    if (failure) {
      snapshot.sources[source.id] = {
        url: source.url,
        ok: false,
        error: failure,
        ...(baseline ? { carriedOver: true } : {}),
        files: baseline ? (old.files ?? {}) : {},
      };
      sourceErrors.push({ id: source.id, url: source.url, error: failure, kept: baseline });
    } else {
      snapshot.sources[source.id] = { url: source.url, ok: true, files: sortedObject(files) };
    }
  }
  return { snapshot, sourceErrors, fileErrors };
}

const FIELD_LABELS = [
  ['etag', 'ETag'],
  ['lastModified', 'Dernière modification'],
  ['length', 'Taille'],
];

const normalizeEtag = (etag) => String(etag).trim().replace(/^W\//i, ''); // faible et fort : même étiquette
const sameValue = (field, a, b) => (field === 'etag' ? normalizeEtag(a) === normalizeEtag(b) : a === b);

/** Différences entre deux lectures ; une valeur absente d'un côté (en-tête omis par le serveur) ne se compare pas. */
function diffMeta(before, after) {
  const changes = [];
  for (const [field, label] of FIELD_LABELS) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (from === null || to === null) continue;
    if (!sameValue(field, from, to)) changes.push({ field, label, from, to });
  }
  const statusBefore = before.status ?? 200;
  const statusAfter = after.status ?? 200;
  if (statusBefore !== statusAfter) changes.push({ field: 'status', label: 'Statut HTTP', from: statusBefore, to: statusAfter });
  return changes;
}

/**
 * Compare deux snapshots. Les sources en erreur sont ignorées (jamais de « retrait » dû à une panne),
 * les sources sans référence antérieure donnent {baseline:true} et aucun changement.
 */
export function compareSnapshots(prev, next) {
  const out = [];
  for (const [id, current] of Object.entries(next.sources)) {
    if (!current.ok) continue;
    const old = prev?.sources?.[id];
    const known = hasBaseline(old, current.url);
    const before = known ? (old.files ?? {}) : {};
    const after = current.files ?? {};
    const entry = {
      id,
      baseline: !known,
      before: Object.keys(before).length,
      now: Object.keys(after).length,
      added: [],
      removed: [],
      modified: [],
    };
    if (known) {
      for (const url of Object.keys(after)) {
        if (!(url in before)) entry.added.push({ url, meta: after[url] });
        else {
          const changes = diffMeta(before[url], after[url]);
          if (changes.length) entry.modified.push({ url, meta: after[url], changes });
        }
      }
      for (const url of Object.keys(before)) {
        if (!(url in after)) entry.removed.push({ url, meta: before[url] });
      }
    }
    out.push(entry);
  }
  return out;
}

export function countTotals(comparison) {
  const totals = { added: 0, modified: 0, removed: 0 };
  for (const c of comparison) {
    totals.added += c.added.length;
    totals.modified += c.modified.length;
    totals.removed += c.removed.length;
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Rapport (français, Markdown)
// ---------------------------------------------------------------------------

const code = (text) => '`' + text + '`';
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const baseName = (url) => url.split('/').filter(Boolean).pop() ?? url;
const mdText = (text) => text.replace(/([\\[\]`*_<>|])/g, '\\$1');
const sizeText = (n) => (n === null || n === undefined ? null : `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} octets`);

function mdUrl(url) {
  try {
    return new URL(url).href.replace(/\(/g, '%28').replace(/\)/g, '%29');
  } catch {
    return url;
  }
}

const mdLink = (url) => `[${mdText(baseName(url))}](${mdUrl(url)})`;

function describeMeta(meta) {
  if (meta.status) return `HTTP ${meta.status} (fichier introuvable)`;
  const parts = [];
  if (meta.lastModified) parts.push(`dernière modification : ${meta.lastModified}`);
  const size = sizeText(meta.length);
  if (size) parts.push(size);
  return parts.join(' ; ');
}

function formatValue(field, value) {
  if (value === null || value === undefined) return '(absent)';
  if (field === 'length') return sizeText(value);
  if (field === 'status') return `HTTP ${value}`;
  return code(value);
}

function pushList(lines, title, items, render) {
  if (!items.length) return;
  lines.push(`**${title} (${items.length})**`, '');
  for (const item of items.slice(0, MAX_ITEMS)) lines.push(...render(item));
  if (items.length > MAX_ITEMS) lines.push(`- … et ${items.length - MAX_ITEMS} autres (liste complète dans ${code('data/ministry-snapshot.json')})`);
  lines.push('');
}

export function renderReport({ sources, comparison, sourceErrors = [], fileErrors = [], previousGeneratedAt = null, now }) {
  const totals = countTotals(comparison);
  const byId = new Map(comparison.map((c) => [c.id, c]));
  const when = new Date(now).toLocaleString('fr-FR', { timeZone: 'Asia/Jerusalem', dateStyle: 'long', timeStyle: 'short' });
  const lines = ['# Le ministère a publié des changements', ''];
  lines.push(`Vérification du ${when} (heure de Jérusalem).${previousGeneratedAt ? ` Référence précédente : ${previousGeneratedAt}.` : ''}`, '');
  lines.push(
    `**Bilan : ${plural(totals.added, 'fichier ajouté', 'fichiers ajoutés')}, ` +
      `${plural(totals.modified, 'modifié', 'modifiés')}, ${plural(totals.removed, 'retiré', 'retirés')}.**`,
    '',
  );
  for (const subject of [...new Set(sources.map((s) => s.subject))]) {
    const blocks = [];
    for (const source of sources.filter((s) => s.subject === subject)) {
      const c = byId.get(source.id);
      if (!c || (!c.added.length && !c.removed.length && !c.modified.length)) continue;
      const what = normalizeFileUrl(source.url, source.url) ? 'document surveillé' : 'page surveillée';
      blocks.push(`### ${source.id} — [${what}](${mdUrl(source.url)})`, '');
      if (c.now === 0 && c.before > 0) {
        blocks.push(`> ⚠️ La page ne contient plus aucun lien vers un fichier (il y en avait ${c.before}) : vérifiez qu'elle n'a pas changé de structure.`, '');
      }
      pushList(blocks, 'Fichiers ajoutés', c.added, (it) => [`- ${mdLink(it.url)}${describeMeta(it.meta) ? ` — ${describeMeta(it.meta)}` : ''}`]);
      pushList(blocks, 'Fichiers modifiés', c.modified, (it) => [
        `- ${mdLink(it.url)}`,
        ...it.changes.map((ch) => `  - ${ch.label} : ${formatValue(ch.field, ch.from)} → ${formatValue(ch.field, ch.to)}`),
      ]);
      pushList(blocks, 'Fichiers retirés', c.removed, (it) => [`- ${mdLink(it.url)} (n'est plus lié depuis la page)`]);
    }
    if (blocks.length) lines.push(`## ${SUBJECT_LABELS[subject] ?? subject}`, '', ...blocks);
  }
  if (sourceErrors.length || fileErrors.length) {
    lines.push('## Erreurs de lecture', '', "Ces erreurs ne sont jamais comptées comme des retraits : l'état précédent est conservé.", '');
    for (const e of sourceErrors) lines.push(`- **${e.id}** — ${e.url} : ${e.error}${e.kept ? '' : ' (aucune référence antérieure)'}`);
    for (const e of fileErrors.slice(0, MAX_ITEMS)) {
      lines.push(`- fichier non vérifié (${e.id}) — ${e.url} : ${e.error}${e.kept ? ' (dernière valeur conservée)' : ' (non enregistré)'}`);
    }
    if (fileErrors.length > MAX_ITEMS) lines.push(`- … et ${fileErrors.length - MAX_ITEMS} autres fichiers non vérifiés`);
    lines.push('');
  }
  lines.push(`_Rapport généré par ${code('scripts/watch-ministry.mjs')} ; la référence est dans ${code('data/ministry-snapshot.json')}._`, '');
  let text = lines.join('\n');
  if (text.length > MAX_REPORT_CHARS) {
    text = `${text.slice(0, text.lastIndexOf('\n', MAX_REPORT_CHARS))}\n\n_… rapport tronqué ; la liste complète est dans ${code('data/ministry-snapshot.json')}._\n`;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Lecture des fichiers de configuration
// ---------------------------------------------------------------------------

async function loadSources(file) {
  let list;
  try {
    list = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    throw new Error(`impossible de lire ${file} : ${err.message}`);
  }
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${file} doit contenir un tableau non vide`);
  const seen = new Set();
  return list.map((entry, i) => {
    for (const key of ['id', 'subject', 'url']) {
      if (typeof entry?.[key] !== 'string' || !entry[key].trim()) throw new Error(`${file} : l'entrée n°${i + 1} n'a pas de champ « ${key} »`);
    }
    if (seen.has(entry.id)) throw new Error(`${file} : identifiant en double « ${entry.id} »`);
    seen.add(entry.id);
    let url;
    try {
      url = new URL(entry.url);
    } catch {
      throw new Error(`${file} : URL invalide pour « ${entry.id} » : ${entry.url}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${file} : l'URL de « ${entry.id} » doit être en http(s)`);
    return { id: entry.id, subject: entry.subject, url: entry.url.trim() };
  });
}

async function readSnapshot(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  if (!text.trim()) return null;
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    throw new Error(`${file} n'est pas un JSON valide ; supprimez-le pour repartir d'une nouvelle référence`);
  }
  if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.sources !== 'object' || snapshot.sources === null) {
    throw new Error(`${file} n'a pas le format attendu (champ « sources » manquant)`);
  }
  return snapshot;
}

function numberOption(name, value, fallback, min = 0) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw new Error(`--${name} : valeur invalide « ${value} »`);
  return n;
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      sources: { type: 'string' },
      snapshot: { type: 'string' },
      diff: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      concurrency: { type: 'string' },
      'pause-ms': { type: 'string' },
      'timeout-ms': { type: 'string' },
      retries: { type: 'string' },
      'retry-delay-ms': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const cfg = {
    concurrency: numberOption('concurrency', values.concurrency, 4, 1),
    pauseMs: numberOption('pause-ms', values['pause-ms'], 250),
    timeoutMs: numberOption('timeout-ms', values['timeout-ms'], 30000, 1),
    retries: numberOption('retries', values.retries, 2),
    retryDelayMs: numberOption('retry-delay-ms', values['retry-delay-ms'], 2000),
  };
  const dryRun = values['dry-run'];
  const sourcesFile = path.resolve(values.sources ?? path.join(ROOT, 'data/sources.json'));
  const snapshotFile = path.resolve(values.snapshot ?? path.join(ROOT, 'data/ministry-snapshot.json'));
  const diffFile = path.resolve(values.diff ?? path.join(ROOT, 'data/ministry-diff.md'));

  const sources = await loadSources(sourcesFile);
  const prev = await readSnapshot(snapshotFile);
  const now = new Date().toISOString();
  console.log(`Surveillance du ministère : ${sources.length} sources, concurrence ${cfg.concurrency}${dryRun ? ' (simulation, rien n’est écrit)' : ''}`);
  if (!prev) console.log('Aucune référence précédente : la référence sera écrite, sans alerte.');

  // 1. Pages -> liens vers des fichiers
  const pages = new Map();
  await runPool(sources, cfg, async (source) => {
    const fileKey = normalizeFileUrl(source.url, source.url);
    if (fileKey) {
      pages.set(source.id, { ok: true, single: true, urls: [fileKey] });
      console.log(`  document ${source.id.padEnd(20)} ${fileKey}`);
      return;
    }
    const got = await fetchPage(source.url, cfg);
    if (!got.ok) {
      pages.set(source.id, { ok: false, error: got.error, urls: [] });
      console.log(`  page     ${source.id.padEnd(20)} ERREUR ${got.error}`);
      return;
    }
    const urls = extractFileLinks(got.html, got.finalUrl);
    pages.set(source.id, { ok: true, urls });
    console.log(`  page     ${source.id.padEnd(20)} ${String(urls.length).padStart(4)} fichier(s) lié(s)`);
  });

  // 2. En-têtes de chaque fichier (une seule requête par fichier, même s'il figure sur plusieurs pages)
  const allUrls = [...new Set([...pages.values()].flatMap((p) => p.urls))].sort();
  console.log(`Vérification de ${allUrls.length} fichier(s) (en-têtes seulement)…`);
  const results = await runPool(allUrls, cfg, (url) => probeFile(url, cfg));
  const probes = new Map(allUrls.map((url, i) => [url, results[i]]));

  // 3. Nouveau snapshot, comparaison, rapport
  const { snapshot, sourceErrors, fileErrors } = buildSnapshot({ sources, prev, pages, probes, now });
  const comparison = compareSnapshots(prev, snapshot);
  const totals = countTotals(comparison);
  const changed = totals.added + totals.modified + totals.removed > 0;
  const report = changed
    ? renderReport({ sources, comparison, sourceErrors, fileErrors, previousGeneratedAt: prev?.generatedAt ?? null, now })
    : null;

  // 4. Résumé dans la console
  console.log('\nRésumé par source :');
  for (const source of sources) {
    const entry = snapshot.sources[source.id];
    const c = comparison.find((x) => x.id === source.id);
    if (!entry.ok) {
      console.log(`  ${source.id.padEnd(20)} ERREUR : ${entry.error}${entry.carriedOver ? ' (état précédent conservé)' : ' (pas encore de référence)'}`);
    } else {
      const delta = !c || c.baseline ? (prev ? 'nouvelle référence' : 'référence') : `+${c.added.length} ~${c.modified.length} -${c.removed.length}`;
      console.log(`  ${source.id.padEnd(20)} ${String(Object.keys(entry.files).length).padStart(4)} fichier(s) suivi(s)   ${delta}`);
    }
  }
  for (const e of fileErrors) console.log(`  fichier non vérifié (${e.id}) ${e.url} : ${e.error}${e.kept ? ' — dernière valeur conservée' : ' — non enregistré'}`);
  const tracked = Object.values(snapshot.sources).reduce((n, s) => n + Object.keys(s.files).length, 0);
  console.log(
    `\nTotal : ${tracked} fichier(s) suivi(s) ; ${totals.added} ajouté(s), ${totals.modified} modifié(s), ${totals.removed} retiré(s) ; ` +
      `${sourceErrors.length} source(s) en erreur.`,
  );
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const e of sourceErrors) console.log(`::warning title=Source en erreur (${e.id})::${e.url} -> ${e.error}`);
  }

  // 5. Écritures
  const strip = ({ generatedAt, ...rest }) => rest; // eslint-disable-line no-unused-vars
  const snapshotDiffers = !prev || !isDeepStrictEqual(strip(prev), strip(snapshot));
  if (dryRun) {
    console.log(snapshotDiffers ? 'Simulation : le snapshot serait mis à jour.' : 'Simulation : le snapshot resterait inchangé.');
    if (report) console.log(`\n----- rapport (non écrit) -----\n${report}-------------------------------`);
  } else {
    if (snapshotDiffers) {
      await writeAtomic(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(`Snapshot écrit : ${snapshotFile}`);
    }
    if (report) {
      await writeAtomic(diffFile, report);
      console.log(`Rapport écrit : ${diffFile}`);
    }
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const rows = sources.map((s) => {
        const e = snapshot.sources[s.id];
        return `| ${s.id} | ${e.ok ? 'ok' : `erreur : ${e.error}`} | ${Object.keys(e.files).length} |`;
      });
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [
          '### Surveillance du ministère',
          '',
          `${totals.added} ajouté(s), ${totals.modified} modifié(s), ${totals.removed} retiré(s) ; ${sourceErrors.length} source(s) en erreur.`,
          '',
          '| Source | État | Fichiers suivis |',
          '| --- | --- | ---: |',
          ...rows,
          '',
        ].join('\n'),
      );
    }
  }
  console.log(`changed=${changed}`);
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`Erreur : ${err.message}`);
      process.exitCode = 1;
    },
  );
}
