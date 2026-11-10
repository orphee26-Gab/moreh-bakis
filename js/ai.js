// Appels à l'IA : soit directement avec la clé de l'utilisateur (tests), soit via un petit serveur (version finale).
import { S, save } from './store.js';

export class AIError extends Error {
  constructor(code, msg) { super(msg || code); this.code = code; }
}
export const aiReady = () => (S.ai.mode === 'key' && !!S.ai.key) || (S.ai.mode === 'proxy' && !!S.ai.proxyUrl);

function clientId() {
  let id = localStorage.getItem('mb.cid');
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); localStorage.setItem('mb.cid', id); }
  return id;
}

export async function chat({ system, messages, maxTokens = 700, vision = false, signal } = {}) {
  if (!aiReady()) throw new AIError('demo', 'demo');
  const model = vision ? S.ai.visionModel : S.ai.model;
  const direct = S.ai.mode === 'key';
  const url = direct ? 'https://api.anthropic.com/v1/messages' : S.ai.proxyUrl.replace(/\/$/, '') + '/v1/messages';
  const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
  if (direct) { headers['x-api-key'] = S.ai.key; headers['anthropic-dangerous-direct-browser-access'] = 'true'; }
  else headers['x-client-id'] = clientId();
  const body = JSON.stringify({ model, max_tokens: maxTokens, system, messages });
  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { res = await fetch(url, { method: 'POST', headers, body, signal }); }
    catch (e) { if (e.name === 'AbortError') throw e; if (attempt) throw new AIError('network'); continue; }
    if (res.status === 529 || res.status === 503) { await new Promise((r) => setTimeout(r, 900)); continue; }
    break;
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch { /* corps vide */ }
    throw new AIError(res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate' : 'http', msg || String(res.status));
  }
  const data = await res.json();
  S.stats.aiCalls = (S.stats.aiCalls || 0) + 1; save();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

export function parseJSON(txt) {
  if (!txt) return null;
  const m = String(txt).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch {
    try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
  }
}

// Message d'erreur lisible pour l'élève.
export function aiErrorKey(e) {
  return { demo: 'err.demo', auth: 'err.auth', rate: 'err.rate', network: 'err.network' }[e?.code] || 'err.http';
}

// Image -> JPEG réduit en base64 (limite le coût et le poids).
export function fileToJpeg(file, max = 1400, q = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      const dataUrl = cv.toDataURL('image/jpeg', q);
      resolve({ dataUrl, base64: dataUrl.split(',')[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new AIError('image')); };
    img.src = url;
  });
}
