// Voix : lecture à voix haute (voix du téléphone ou ElevenLabs) et écoute au micro (téléphone ou ElevenLabs Scribe).
import { S } from './store.js';

export class VoiceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const EL = 'https://api.elevenlabs.io';

/* ---------- voix de l'appareil ---------- */
let voices = [];
const refresh = () => { try { voices = speechSynthesis.getVoices() || []; } catch { voices = []; } };
if ('speechSynthesis' in window) { refresh(); speechSynthesis.addEventListener?.('voiceschanged', refresh); }
const isHe = (v) => /^(he|iw)/i.test(v.lang);
export function deviceVoices(lang = 'he') {
  refresh();
  return voices.filter((v) => (lang === 'he' ? isHe(v) : /^en/i.test(v.lang)));
}
export function bestVoice(lang = 'he') {
  const l = deviceVoices(lang);
  if (!l.length) return null;
  if (lang === 'he') { const p = l.find((v) => v.name === S.voice.deviceVoice); if (p) return p; }
  const sc = (v) => (/natural|neural|online|premium|enhanced|siri/i.test(v.name) ? 4 : 0) + (v.localService ? 0 : 1) + (/google|microsoft|carmit|hila|avri|samantha|daniel|karen|ava/i.test(v.name) ? 1 : 0);
  return [...l].sort((a, b) => sc(b) - sc(a))[0];
}

export const cleanText = (s) => String(s || '').replace(/[*_`#>~|]/g, ' ').replace(/\p{Extended_Pictographic}/gu, ' ').replace(/\s+/g, ' ').trim();
function chunks(text) {
  const parts = text.match(/[^.!?؟…\n]+[.!?؟…]*/g) || [text];
  const out = []; let cur = '';
  for (const p of parts) { if ((cur + p).length > 170 && cur) { out.push(cur.trim()); cur = p; } else cur += p; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ---------- audio partagé (iOS exige un geste pour débloquer) ---------- */
let audioEl, current = null, token = 0;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=';
export const getAudio = () => (audioEl ||= new Audio());
export function unlockAudio() {
  try { const a = getAudio(); a.src = SILENT; a.play().catch(() => {}); } catch { /* ignoré */ }
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch { /* ignoré */ }
}
export function stopSpeaking() {
  token++;
  try { speechSynthesis.cancel(); } catch { /* ignoré */ }
  if (current) { try { current.pause(); } catch { /* ignoré */ } current = null; }
}

function speakDevice(text, lang, my) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const parts = chunks(text); let i = 0;
    const next = () => {
      if (token !== my || i >= parts.length) return resolve();
      const part = parts[i++]; const u = new SpeechSynthesisUtterance(part);
      const v = bestVoice(lang);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'he' ? 'he-IL' : 'en-US';
      u.rate = S.voice.rate || 1;
      let fired = false; const go = () => { if (!fired) { fired = true; clearTimeout(w); next(); } };
      const w = setTimeout(go, 6000 + part.length * 110);
      u.onend = go; u.onerror = go;
      try { speechSynthesis.speak(u); } catch { go(); }
    };
    next();
  });
}

export function elevenModelFor(lang) {
  const e = S.voice.eleven;
  return lang === 'he' ? (e.modelHe || 'eleven_v3') : (e.modelEn || 'eleven_flash_v2_5');
}
export async function elevenTTS(text, lang, voiceId = S.voice.eleven.voiceId) {
  const e = S.voice.eleven;
  const call = (model) => fetch(`${EL}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': e.key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, ...(model.startsWith('eleven_v3') ? {} : { voice_settings: { stability: 0.45, similarity_boost: 0.8 } }) }),
  });
  let model = elevenModelFor(lang);
  let r = await call(model);
  if (!r.ok && model === 'eleven_v3_conversational') { model = 'eleven_v3'; r = await call(model); }
  if (!r.ok) throw new Error('elevenlabs ' + r.status);
  return r.blob();
}
function playBlob(blob, my) {
  return new Promise((resolve) => {
    if (token !== my) return resolve();
    const url = URL.createObjectURL(blob); const a = getAudio(); current = a; a.src = url;
    const done = () => { URL.revokeObjectURL(url); resolve(); };
    a.onended = done; a.onerror = done; a.play().catch(done);
  });
}

export async function speak(text, { lang = 'he' } = {}) {
  const clean = cleanText(text);
  if (!clean) return;
  stopSpeaking();
  const my = token;
  const e = S.voice.eleven;
  if (S.voice.engine === 'eleven' && e.key && e.voiceId) {
    try { await playBlob(await elevenTTS(clean, lang), my); return; } catch (err) { console.warn('ElevenLabs indisponible, voix de l\'appareil :', err.message); }
  }
  await speakDevice(clean, lang, my);
}

/* ---------- écoute ---------- */
export const sttSupported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export const recorderSupported = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
export const micAvailable = () => (S.voice.sttEngine === 'eleven' && S.voice.eleven.key ? recorderSupported() : sttSupported());

export function listen({ lang = 'he', onInterim } = {}) {
  if (S.voice.sttEngine === 'eleven' && S.voice.eleven.key) return listenRecorder({ lang });
  return listenDevice({ lang, onInterim });
}

function listenDevice({ lang, onInterim }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return { promise: Promise.reject(new VoiceError('unsupported')), stop() {} };
  const rec = new SR();
  rec.lang = lang === 'he' ? 'he-IL' : 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = '';
  const promise = new Promise((resolve, reject) => {
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
      onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (e) => { if (e.error === 'no-speech' || e.error === 'aborted') return; reject(new VoiceError(e.error || 'error')); };
    rec.onend = () => resolve(finalText.trim());
    try { rec.start(); } catch { reject(new VoiceError('start')); }
  });
  return { promise, stop() { try { rec.stop(); } catch { /* ignoré */ } } };
}

function listenRecorder({ lang }) {
  let rec, stream, ctxA, raf, stopped = false; const parts = [];
  const stop = () => { stopped = true; try { if (rec && rec.state !== 'inactive') rec.stop(); } catch { /* ignoré */ } };
  const promise = new Promise(async (resolve, reject) => {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { return reject(new VoiceError('not-allowed')); }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch { return reject(new VoiceError('unsupported')); }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    rec.onstop = async () => {
      cancelAnimationFrame(raf); try { ctxA?.close(); } catch { /* ignoré */ }
      stream.getTracks().forEach((tr) => tr.stop());
      const blob = new Blob(parts, { type: rec.mimeType || 'audio/webm' });
      if (blob.size < 3000) return resolve('');
      try { resolve(await transcribeEleven(blob, lang)); } catch { reject(new VoiceError('stt')); }
    };
    try { // fin automatique après un silence
      ctxA = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctxA.createAnalyser(); an.fftSize = 1024; ctxA.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize); let spoke = false; const t0 = performance.now(); let last = t0;
      const loop = () => {
        if (stopped) return;
        an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += (v - 128) ** 2;
        const rms = Math.sqrt(s / buf.length), now = performance.now();
        if (rms > 9) { spoke = true; last = now; }
        if ((spoke && now - last > 1300) || now - t0 > 30000 || (!spoke && now - t0 > 9000)) return stop();
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch { /* sans détection de silence : arrêt manuel */ }
    rec.start();
  });
  return { promise, stop };
}

export async function transcribeEleven(blob, lang) {
  const fd = new FormData();
  fd.append('model_id', 'scribe_v2');
  fd.append('language_code', lang === 'he' ? 'heb' : 'eng');
  fd.append('file', blob, 'speech.' + (blob.type.includes('mp4') ? 'm4a' : 'webm'));
  const r = await fetch(`${EL}/v1/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': S.voice.eleven.key }, body: fd });
  if (!r.ok) throw new Error('scribe ' + r.status);
  return ((await r.json()).text || '').trim();
}

/* ---------- catalogue de voix ElevenLabs ---------- */
export async function elevenVoices() {
  const r = await fetch(`${EL}/v1/voices`, { headers: { 'xi-api-key': S.voice.eleven.key } });
  if (!r.ok) throw new Error('voices ' + r.status);
  return (await r.json()).voices || [];
}
export async function elevenSearchHebrew(search = '') {
  const q = new URLSearchParams({ language: 'he', page_size: '24', sort: 'trending' });
  if (search) q.set('search', search);
  const r = await fetch(`${EL}/v1/shared-voices?${q}`, { headers: { 'xi-api-key': S.voice.eleven.key } });
  if (!r.ok) throw new Error('library ' + r.status);
  return (await r.json()).voices || [];
}
export async function elevenAddShared(v) {
  const r = await fetch(`${EL}/v1/voices/add/${v.public_owner_id}/${v.voice_id}`, {
    method: 'POST', headers: { 'xi-api-key': S.voice.eleven.key, 'content-type': 'application/json' }, body: JSON.stringify({ new_name: v.name }),
  });
  if (!r.ok) throw new Error('add ' + r.status);
  return (await r.json()).voice_id || v.voice_id;
}
