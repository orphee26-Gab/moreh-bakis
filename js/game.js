// Points, niveaux, série de jours, badges, énergie (limite du mode gratuit).
import { S, save } from './store.js';
import { today, yesterday, toast, confetti, sfx, modal } from './ui.js';
import { t } from './i18n.js';

export const FREE_ENERGY = 5;
export const levelOf = (xp) => Math.floor(Math.sqrt(xp / 40)) + 1;
const levelFloor = (l) => (l - 1) * (l - 1) * 40;
export function levelInfo() {
  const l = levelOf(S.xp), lo = levelFloor(l), hi = levelFloor(l + 1);
  return { level: l, pct: Math.round(((S.xp - lo) / (hi - lo)) * 100), toNext: hi - S.xp };
}

export const BADGES = [
  { id: 'first_lesson', icon: '🎓', ok: (s) => s.stats.lessons >= 1 },
  { id: 'lessons5', icon: '📚', ok: (s) => s.stats.lessons >= 5 },
  { id: 'streak3', icon: '🔥', ok: (s) => s.streak >= 3 },
  { id: 'streak7', icon: '🌋', ok: (s) => s.streak >= 7 },
  { id: 'xp100', icon: '⚡', ok: (s) => s.xp >= 100 },
  { id: 'xp500', icon: '🚀', ok: (s) => s.xp >= 500 },
  { id: 'photo1', icon: '📷', ok: (s) => s.stats.photos >= 1 },
  { id: 'call1', icon: '🎙️', ok: (s) => s.stats.calls >= 1 },
  { id: 'perfect', icon: '⭐', ok: (s) => Object.values(s.done).some((d) => d.stars >= 3) },
];
export function checkBadges() {
  BADGES.forEach((b) => {
    if (!S.badges.includes(b.id) && b.ok(S)) { S.badges.push(b.id); save(); toast(`${b.icon} ${t('badge.' + b.id)}`); sfx('win'); }
  });
}

export function touch() {
  const d = today();
  if (S.lastActive === d) return;
  S.streak = S.lastActive === yesterday() ? S.streak + 1 : 1;
  S.best = Math.max(S.best, S.streak);
  S.lastActive = d;
  save(); checkBadges();
}
export function addXP(n) {
  touch();
  const before = levelOf(S.xp);
  S.xp += n; S.coins += Math.round(n / 5);
  if (S.daily.date !== today()) S.daily = { date: today(), xp: 0, goal: S.daily.goal || 60, chest: false };
  S.daily.xp += n;
  save();
  const after = levelOf(S.xp);
  if (after > before) { toast(t('game.levelup', { n: after })); confetti(); sfx('win'); }
  checkBadges();
}
export function dailyInfo() {
  if (S.daily.date !== today()) { S.daily = { date: today(), xp: 0, goal: S.daily.goal || 60, chest: false }; save(); }
  return { xp: S.daily.xp, goal: S.daily.goal, pct: Math.round((S.daily.xp / S.daily.goal) * 100), chestReady: S.daily.xp >= S.daily.goal && !S.daily.chest };
}
export function openChest() {
  if (!dailyInfo().chestReady) return 0;
  S.daily.chest = true; S.coins += 25; save(); confetti(); sfx('win'); return 25;
}
export function markDone(id, stars) {
  const prev = S.done[id];
  S.done[id] = { stars: Math.max(stars, prev?.stars || 0), at: Date.now() };
  save(); checkBadges();
}

export function energyLeft() {
  if (S.plan === 'pro') return Infinity;
  if (S.energy.date !== today()) { S.energy = { date: today(), used: 0 }; save(); }
  return Math.max(0, FREE_ENERGY - S.energy.used);
}
export function spendEnergy() {
  if (S.plan === 'pro') return true;
  if (energyLeft() <= 0) return false;
  S.energy.used++; save(); return true;
}
export function paywall() {
  modal({
    title: t('pay.title'),
    body: `<p>${t('pay.body')}</p><p class="warn">${t('pay.demo')}</p>`,
    actions: [
      { label: t('pay.start'), cls: 'sun', onClick: () => { S.plan = 'pro'; save(); toast(t('pay.on')); } },
      { label: t('pay.later'), cls: 'ghost' },
    ],
  });
}
