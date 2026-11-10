// Mandataire gratuit vers l'API Anthropic, pour que la clé d'API ne soit jamais dans le téléphone des élèves.
// Déploiement : npm i -g wrangler && wrangler login && wrangler deploy
// La clé d'API se met dans un secret : wrangler secret put ANTHROPIC_API_KEY
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return cors(null, 204);
    if (url.pathname === '/limits') {
      const used = Number((await env.mb.get('usage')) || 0);
      return cors({ free: true, used, left: Math.max(0, DAILY - used) }, 200);
    }
    if (req.method !== 'POST' || !url.pathname.endsWith('/v1/messages')) return cors({ error: 'Chemin attendu : /v1/messages' }, 404);
    if (!req.headers.get('x-api-key')) return cors({ error: 'x-api-key manquant' }, 401);

    // Garde-fou : 90 000 appels par jour et 3 000 000 au total, pour rester gratuit.
    const key = `d:${new Date().toISOString().slice(0, 10)}`;
    const n = Number((await env.mb.get(key)) || 0);
    if (n >= DAILY) return cors({ error: 'Quota gratuit du jour atteint', code: 'quota' }, 429);
    const total = Number((await env.mb.get('total')) || 0);
    if (total >= TOTAL) return cors({ error: 'Plafond gratuit atteint', code: 'quota' }, 429);

    const headers = new Headers();
    for (const [k, v] of req.headers) if (!['host', 'accept-encoding'].includes(k.toLowerCase())) headers.set(k, v);
    headers.set('x-api-key', env.ANTHROPIC_API_KEY || '');
    headers.set('anthropic-version', headers.get('anthropic-version') || '2023-06-01');
    let body;
    try { body = await req.text(); } catch { return cors({ error: 'Corps illisible' }, 400); }

    try {
      const up = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body });
      await env.mb.put(key, String(n + 1), { expirationTtl: 172800 });
      await env.mb.put('total', String(total + 1));
      await env.mb.put('usage', String(n + 1), { expirationTtl: 172800 });
      return cors(up.body, up.status, { 'content-type': up.headers.get('content-type') || 'application/json' });
    } catch (e) {
      return cors({ error: 'Le serveur d\'IA n\'a pas répondu', detail: String(e && e.message || e) }, 502);
    }
  }
};
const DAILY = 90000, TOTAL = 3000000;
function cors(body, status = 200, extra = {}) {
  return new Response(body === null ? null : (typeof body === 'string' ? body : JSON.stringify(body)), {
    status,
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,OPTIONS', ...extra }
  });
}
