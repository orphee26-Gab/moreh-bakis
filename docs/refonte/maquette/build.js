const fs = require('fs'), path = require('path');
const D = __dirname, ICONS = path.join(D, '..', 'node_modules', 'lucide-static', 'icons');
const icon = (n) => { let s = fs.readFileSync(path.join(ICONS, n + '.svg'), 'utf8'); s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/\s(width|height)="24"/g, '').replace(/stroke-width="2"/, 'stroke-width="1.5"').replace(/class="[^"]*"/, ''); return `<span class="ic" aria-hidden="true">${s.trim()}</span>`; };
const check = '<svg class="check" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 12.9c1.7 1.1 3.2 2.6 4.6 4.7 2.6-5 6.1-9.1 11-12.2"/></svg>';
// ניצוץ, à plat : une étoile pleine, deux yeux, un sourire
function star(cx, cy, R, r) { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; p.push((cx + rad * Math.cos(a)).toFixed(1) + ',' + (cy + rad * Math.sin(a)).toFixed(1)); } return p.join(' '); }
const mark = `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><polygon points="${star(50, 54, 46, 24)}" fill="#f2b230" stroke="#f2b230" stroke-width="8" stroke-linejoin="round"/><circle cx="41" cy="54" r="5" fill="#1d1d22"/><circle cx="59" cy="54" r="5" fill="#1d1d22"/><path d="M43 65q7 6 14 0" fill="none" stroke="#1d1d22" stroke-width="4" stroke-linecap="round"/></svg>`;
const nav = (on) => `<nav class="nav">${[['house', 'בית', 'home'], ['book-open', 'לימוד', 'learn'], ['camera', 'צילום', 'cam'], ['mic', 'שיחה', 'talk'], ['user', 'פרופיל', 'me']].map(([i, l, k]) => k === 'cam' ? `<a class="cam" href="#"><span class="disc">${icon(i)}</span>${l}</a>` : `<a href="#" class="${k === on ? 'on' : ''}">${icon(i)}${l}</a>`).join('')}</nav>`;

const home = `<div class="screen">
<header class="topbar"><div class="brand">${mark}מורה בכיס</div>
<div class="meta num"><span title="ימים ברצף">${icon('flame')}6</span><span title="נקודות">${icon('zap')}340</span><span title="אנרגיה">${icon('heart')}5/5</span></div></header>
<div class="scroll">
<div class="title">יום ראשון, 22 בנובמבר</div>
<div class="level num"><span>רמה 3</span><div class="bar"><i style="width:62%"></i></div><span>עוד 20 נקודות</span></div>
<section class="card resume"><div class="eyebrow">ממשיכים מאיפה שעצרנו</div><h2>חשבון אינטגרלי</h2><div class="where">מתמטיקה · 5 יח״ל · כיתה י״א</div>
<button class="btn primary block">${icon('play')}להמשיך את השיעור</button></section>
<section class="card goal"><div class="txt"><b>היעד היומי</b><div class="fig num">40 מתוך 60 נקודות · עוד שיעור קצר אחד</div><div class="bar"><i style="width:67%"></i></div></div></section>
<div class="quick"><button>${icon('camera')}צילום תרגיל</button><button>${icon('mic')}שיחה חיה</button><button>${icon('video')}מורה אמיתי</button></div>
<div class="sec"><h3>המקצועות שלי</h3></div>
<div class="subjects">
${[['sigma', 'מתמטיקה', '3 · 4 · 5 יח״ל', 2, 6], ['triangle-right', 'גאומטריה', '3 · 4 · 5 יח״ל', 0, 5], ['languages', 'אנגלית', '3 · 4 · 5 יח״ל', 1, 7], ['atom', 'פיזיקה', '5 יח״ל', 0, 6]].map(([i, n, u, d, t]) => `<button class="srow">${icon(i)}<div class="nm"><b>${n}</b><span class="num">${u}</span></div><div class="pr num"><span>${d}/${t}</span><div class="bar"><i style="width:${Math.round(d / t * 100)}%"></i></div></div>${icon('chevron-left').replace('class="ic"', 'class="ic chev"')}</button>`).join('')}
</div>
</div>
${nav('home')}
</div>`;

const topics = ['אינדוקציה מתמטית וסדרות', 'חשבון דיפרנציאלי', 'חשבון אינטגרלי', 'זהויות טריגונומטריות ויישומן בבעיות בגאומטריה', 'חשבון דיפרנציאלי ואינטגרלי של פונקציות טריגונומטריות', 'הסתברות'];
const stops = topics.map((t, i) => i < 2
  ? `<div class="stop done"><span class="dot">${check}</span><span class="lbl">${t}</span></div>`
  : i === 2
  ? `<div class="stop cur"><span class="dot num">${i + 1}</span><div class="curcard"><small>הנושא הבא</small><b>${t}</b><div class="acts"><button class="btn primary">${icon('mic')}שיעור בקול</button><button class="btn secondary">בכתיבה</button></div></div></div>`
  : `<div class="stop lock"><span class="dot num">${i + 1}</span><span class="lbl">${t}</span></div>`).join('') + `<div class="stop boss lock"><span class="dot">${icon('trophy')}</span><span class="lbl">מיני־בגרות<small>חזרה על כל נושאי השנה</small></span></div>`;
const map = `<div class="screen">
<header class="head"><button class="iconbtn" aria-label="חזרה">${icon('arrow-right')}</button><h1>מתמטיקה</h1></header>
<div class="segs"><div class="seg num"><button>3 יח״ל</button><button>4 יח״ל</button><button class="on">5 יח״ל</button></div>
<div class="seg"><button>כיתה י׳</button><button class="on">כיתה י״א</button><button>כיתה י״ב</button></div></div>
<div class="note">${icon('info')}<span>התוכנית נאספה מאתר משרד החינוך ועדיין לא אושרה סופית</span></div>
<div class="prog num"><span>2 מתוך 6 נושאים</span><div class="bar"><i style="width:33%"></i></div></div>
<div class="paper"><div class="route">${stops}</div></div>
${nav('learn')}
</div>`;
const tpl = fs.readFileSync(path.join(D, 'template.html'), 'utf8');
fs.writeFileSync(path.join(D, 'home.html'), tpl.replace('<!--SCREEN-->', home));
fs.writeFileSync(path.join(D, 'map.html'), tpl.replace('<!--SCREEN-->', map));
console.log('ok');
