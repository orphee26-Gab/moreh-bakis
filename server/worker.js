// Mandataire (proxy) vers l'API Anthropic pour « מורה בכיס ».
// La clé d'API est dans un secret Cloudflare (ANTHROPIC_API_KEY) : jamais dans le dépôt, jamais dans le téléphone des élèves.
// Le serveur ne stocke rien : le plan gratuit limite KV à 1 000 écritures par jour, trop peu pour des compteurs.
// Protections : sites autorisés, modèles Haiku et Sonnet seulement, longueur de réponse plafonnée, taille limitée,
// débit limité par appareil et par adresse IP. Le vrai plafond de dépense est celui du compte Anthropic (crédit prépayé).
// Déploiement et tests : voir server/README.md

const MAX_TOKENS = 2400; // l'appli demande au plus 2 200
const MAX_BODY = 4_000_000; // octets ; une photo d'exercice réduite pèse moins d'un Mo
const MODEL = /^claude-(haiku|sonnet)-[a-z0-9.-]+$/; // pas d'Opus : trop cher pour des élèves
const FIELDS = ['model', 'max_tokens', 'system', 'messages', 'temperature']; // rien d'autre n'est transmis (pas d'outils, pas de flux)
const OUT_OF_CREDIT = /credit balance|usage limit|spend limit/i;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin') || '';
    const allowed = origin !== '' && String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).includes(origin);
    const send = (body, status = 200, extra) => reply(body, status, allowed ? origin : '', extra);
    const fail = (status, type, message, extra = {}) => send({ type: 'error', error: { type, message }, ...extra }, status);

    if (req.method === 'OPTIONS') return allowed ? send(null, 204) : fail(403, 'forbidden', 'Origine non autorisée');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return send({ ok: true, service: 'moreh-bakis-proxy', ai: Boolean(env.ANTHROPIC_API_KEY) });
    }
    if (req.method !== 'POST' || !url.pathname.endsWith('/v1/messages')) return fail(404, 'not_found', 'Chemin attendu : POST /v1/messages');
    if (!allowed) return fail(403, 'forbidden', 'Origine non autorisée');
    if (!env.ANTHROPIC_API_KEY) return fail(503, 'api_error', "Le serveur n'a pas encore de clé d'IA");

    // Débit : par appareil (identifiant tiré au hasard par l'appli) et, plus large, par adresse IP.
    const ip = req.headers.get('cf-connecting-ip') || 'ip-inconnue';
    const cid = (req.headers.get('x-client-id') || '').trim();
    const device = /^[A-Za-z0-9-]{8,64}$/.test(cid) ? cid : ip;
    for (const [limiter, key] of [[env.PER_DEVICE, device], [env.PER_IP, ip]]) {
      if (limiter && !(await limiter.limit({ key })).success) {
        return fail(429, 'rate_limit_error', 'Trop de demandes, réessayez dans un instant', { code: 'quota' });
      }
    }

    if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return fail(413, 'request_too_large', 'Demande trop volumineuse');
    let text;
    try { text = await req.text(); } catch { return fail(400, 'invalid_request_error', 'Corps illisible'); }
    if (text.length > MAX_BODY) return fail(413, 'request_too_large', 'Demande trop volumineuse');
    let input;
    try { input = JSON.parse(text); } catch { return fail(400, 'invalid_request_error', 'JSON invalide'); }
    if (!input || typeof input.model !== 'string' || !MODEL.test(input.model)) return fail(400, 'invalid_request_error', 'Modèle non autorisé');
    if (!Array.isArray(input.messages) || input.messages.length === 0) return fail(400, 'invalid_request_error', 'Messages manquants');

    const out = {};
    for (const k of FIELDS) if (input[k] !== undefined) out[k] = input[k];
    out.max_tokens = Math.min(MAX_TOKENS, Math.max(1, Math.floor(Number(input.max_tokens) || 700)));
    // Cas normal de l'appli : rien à retirer ni à corriger, donc le texte d'origine est transmis tel quel
    // (évite de ré-encoder une photo de plusieurs centaines de Ko : le plan gratuit limite le temps de calcul à 10 ms).
    const unchanged = Object.keys(input).every((k) => FIELDS.includes(k)) && input.max_tokens === out.max_tokens;

    const started = Date.now();
    let up;
    try {
      up = await fetch(env.UPSTREAM || 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        // En-têtes reconstruits : ni Origin (Anthropic le refuserait sans autorisation navigateur), ni x-client-id.
        headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': env.ANTHROPIC_API_KEY },
        body: unchanged ? text : JSON.stringify(out),
      });
    } catch (e) {
      console.error('IA injoignable :', String((e && e.message) || e));
      return fail(502, 'api_error', "Le serveur d'IA n'a pas répondu");
    }
    console.log(JSON.stringify({ model: out.model, status: up.status, ms: Date.now() - started })); // jamais le contenu des échanges

    const type = { 'content-type': up.headers.get('content-type') || 'application/json' };
    if (up.status === 401 || up.status === 403) {
      console.error('Clé Anthropic refusée, statut', up.status);
      return fail(502, 'api_error', "Le serveur d'IA est mal configuré");
    }
    if (up.status >= 400) {
      const detail = await up.text();
      if (up.status === 429 || (up.status === 400 && OUT_OF_CREDIT.test(detail))) {
        console.error('Quota Anthropic :', detail.slice(0, 200));
        return fail(429, 'rate_limit_error', 'Le quota gratuit est atteint pour le moment', { code: 'quota' });
      }
      return send(detail, up.status, type);
    }
    return send(up.body, up.status, type);
  },
};

function reply(body, status, origin, extra = {}) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin', ...extra });
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type, anthropic-version, x-client-id');
    headers.set('access-control-max-age', '7200');
  }
  const payload = body === null || typeof body === 'string' || body instanceof ReadableStream ? body : JSON.stringify(body);
  return new Response(payload, { status, headers });
}
