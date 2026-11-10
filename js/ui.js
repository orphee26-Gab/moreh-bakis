// Utilitaires d'interface : sélecteurs, échappement, notifications, fenêtres, mascotte, confettis, sons.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const yesterday = () => ymd(new Date(Date.now() - 864e5));
export const flags = { sound: true };

export function toast(msg, ms = 2800) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.className = 'toast show';
  clearTimeout(el._t); el._t = setTimeout(() => { el.className = 'toast'; }, ms);
}

export function modal({ title = '', body = '', actions = [], dismiss = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${title ? `<h3>${esc(title)}</h3>` : ''}<div class="mbody">${body}</div><div class="mact"></div></div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 200); };
  const act = $('.mact', wrap);
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.onclick = async () => { if (a.onClick) await a.onClick(close); if (!a.keep) close(); };
    act.appendChild(b);
  });
  if (dismiss) wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  requestAnimationFrame(() => wrap.classList.add('in'));
  return { close, el: wrap };
}

export function confetti(n = 90) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let cv = $('#confetti');
  if (!cv) { cv = document.createElement('canvas'); cv.id = 'confetti'; document.body.appendChild(cv); }
  const c = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#ffc95a', '#4fd6a6', '#8f84ff', '#ff7b8f', '#5cc8ff'];
  const ps = Array.from({ length: n }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .55, vx: (Math.random() - .5) * 11, vy: -Math.random() * 13 - 4, g: .35 + Math.random() * .2, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[(Math.random() * cols.length) | 0] }));
  let f = 0;
  (function tick() {
    c.clearRect(0, 0, cv.width, cv.height);
    ps.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.r += p.vr; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c; c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); c.restore(); });
    if (++f < 110) requestAnimationFrame(tick); else c.clearRect(0, 0, cv.width, cv.height);
  })();
}

let ac;
export function sfx(kind) {
  if (!flags.sound) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const seqs = { ok: [[660, 0], [880, .09], [1100, .18]], bad: [[220, 0], [170, .13]], tap: [[520, 0]], win: [[523, 0], [659, .1], [784, .2], [1046, .32]] };
    (seqs[kind] || []).forEach(([f, t]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = kind === 'bad' ? 'triangle' : 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.16, ac.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t + .22);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .25);
    });
  } catch { /* son indisponible */ }
}

function star(cx, cy, R, r, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const rad = i % 2 ? r : R; const a = -Math.PI / 2 + i * Math.PI / n; pts.push((cx + rad * Math.cos(a)).toFixed(1) + ',' + (cy + rad * Math.sin(a)).toFixed(1)); }
  return pts.join(' ');
}
// états : idle, speaking, listening, thinking, happy, sad
export function mascot(state = 'idle', size = 110) {
  return `<div class="mascot m-${state}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"><defs><radialGradient id="mg" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#ffb938"/></radialGradient></defs><circle class="glow" cx="50" cy="52" r="47" fill="#ffd36a" opacity="0"/><polygon points="${star(50, 54, 43, 23)}" fill="url(#mg)" stroke="#ffcf5e" stroke-width="7" stroke-linejoin="round"/><g class="eyes"><ellipse cx="40" cy="52" rx="4.6" ry="5.6" fill="#1b1f3a"/><ellipse cx="60" cy="52" rx="4.6" ry="5.6" fill="#1b1f3a"/><circle cx="41.6" cy="50" r="1.5" fill="#fff"/><circle cx="61.6" cy="50" r="1.5" fill="#fff"/></g><ellipse cx="31" cy="62" rx="4.5" ry="3" fill="#ff8c9a" opacity=".55"/><ellipse cx="69" cy="62" rx="4.5" ry="3" fill="#ff8c9a" opacity=".55"/><path class="mouth" d="M42 63 Q50 71 58 63" fill="none" stroke="#1b1f3a" stroke-width="3" stroke-linecap="round"/></svg></div>`;
}
export function setMascot(root, state) {
  const m = $('.mascot', root);
  if (m) m.className = m.className.replace(/\bm-\w+/g, '') + ' m-' + state;
}

export function ring(pct, label = '') {
  const R = 34, C = 2 * Math.PI * R, off = C * (1 - Math.min(1, Math.max(0, pct) / 100));
  return `<div class="ringbox"><svg width="84" height="84" viewBox="0 0 84 84"><circle cx="42" cy="42" r="${R}" fill="none" stroke="#ffffff1a" stroke-width="9"/><circle cx="42" cy="42" r="${R}" fill="none" stroke="#4fd6a6" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><b>${esc(label)}</b></div>`;
}
