// Leçons de démonstration (sans IA) : trois exercices vérifiés à la main pour les maths et l'anglais.
// Sert uniquement tant qu'aucune clé IA n'est branchée (réglages).

const norm = (s) => String(s).toLowerCase().replace(/[\s·*×.,'’"]/g, '').replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/[–−]/g, '-');

const MATH = {
  lang: 'he',
  intro: {
    say: "בואו נלמד נגזרת של מכפלה. הכלל: הנגזרת של f כפול g היא f' כפול g, ועוד f כפול g'. למשל: הנגזרת של x כפול x ועוד 1 היא 1 כפול x ועוד 1, ועוד x כפול 1, כלומר 2x ועוד 1. עכשיו תורכם: מהי הנגזרת של x² כפול x ועוד 3?",
    board: "(f·g)' = f'·g + f·g'\n(x·(x+1))' = 1·(x+1) + x·1 = 2x+1",
  },
  qs: [
    { ok: ['3x^2+6x', '6x+3x^2', '3x^2+6x+0'], good: "מצוין! 2x כפול x ועוד 3, ועוד x² כפול 1, זה 3x² ועוד 6x.", bad: "כמעט. הכלל נותן 2x·(x+3) + x²·1, וזה 3x² ועוד 6x.", board: "(x²·(x+3))' = 2x(x+3) + x²·1 = 3x²+6x", next: "שאלה הבאה: מהי הנגזרת של x כפול x בשלישית?" },
    { ok: ['4x^3'], good: "נכון! 1·x³ ועוד x·3x², וזה 4x³.", bad: "הכלל נותן 1·x³ ועוד x·3x², וזה 4x³.", board: "(x·x³)' = x³ + 3x³ = 4x³", next: "שאלה אחרונה: מהי הנגזרת של x ועוד 1 כפול x ועוד 2?" },
    { ok: ['2x+3', '3+2x'], good: "יפה מאוד! 1·(x+2) ועוד (x+1)·1, וזה 2x ועוד 3.", bad: "הכלל נותן 1·(x+2) ועוד (x+1)·1, וזה 2x ועוד 3.", board: "((x+1)(x+2))' = (x+2) + (x+1) = 2x+3" },
  ],
  outro: "סיכום: כדי לגזור מכפלה, גוזרים את הראשון ומשאירים את השני, ועוד משאירים את הראשון וגוזרים את השני. כל הכבוד!",
};

const ENGLISH = {
  lang: 'en',
  intro: {
    say: "The present perfect connects the past with now. We use have or has, plus the past participle. For example: I have lived here for five years. Now you try. Complete the sentence: She ___ (finish) her homework already.",
    board: "have / has + past participle\nI have lived here for five years.",
  },
  qs: [
    { ok: ['hasfinished'], good: "Perfect! She has finished her homework already.", bad: "Almost. The answer is: has finished.", board: "She has finished her homework already.", next: "Next one. Complete: I ___ (not / see) that movie yet." },
    { ok: ['havenotseen', 'haventseen'], good: "Great! I haven't seen that movie yet.", bad: "The answer is: haven't seen, or have not seen.", board: "I haven't seen that movie yet.", next: "Last question. Complete: Have you ever ___ (eat) sushi?" },
    { ok: ['eaten'], good: "Excellent! Have you ever eaten sushi?", bad: "The answer is: eaten.", board: "Have you ever eaten sushi?" },
  ],
  outro: "Summary: use have or has with the past participle to talk about experiences and things that connect the past with now. Well done!",
};

function generic(d) {
  const subs = (d.subs || []).slice(0, 4);
  return {
    lang: 'he',
    intro: { say: `זהו שיעור הדגמה בנושא: ${d.title}. כדי שניצוץ ילמד אתכם את הנושא באמת, חברו מפתח IA בהגדרות. בינתיים, שאלה אחת: מה לדעתכם החלק החשוב ביותר בנושא הזה? כתבו משפט אחד.`, board: [d.title, ...subs.map((s) => '• ' + s)].join('\n') },
    qs: [{ ok: null, good: 'תודה על התשובה! בגרסה המחוברת ניצוץ היה בודק אותה ומסביר לפי התוכנית הרשמית.', bad: '', board: '' }],
    outro: 'זה היה שיעור הדגמה קצר. עם חיבור IA תקבלו שיעור מלא של שלוש שאלות על הנושא.',
  };
}

export function createDemo(d) {
  const script = d.kind === 'school' && d.subjectId === 'math' ? MATH : d.kind === 'school' && d.subjectId === 'english' ? ENGLISH : generic(d);
  let i = -1;
  return {
    lang: script.lang,
    generic: script === undefined || (d.subjectId !== 'math' && d.subjectId !== 'english') || d.kind === 'academy',
    next(userText) {
      if (i < 0) { i = 0; return { say: script.intro.say, board: script.intro.board, kind: 'explain', correct: null, done: false }; }
      const q = script.qs[i];
      const ok = q.ok ? q.ok.includes(norm(userText)) : true;
      const last = i === script.qs.length - 1;
      i++;
      const say = (ok ? q.good : q.bad) + ' ' + (last ? script.outro : q.next || '');
      return { say, board: q.board || '', kind: last ? 'summary' : 'feedback', correct: ok, done: last };
    },
  };
}

const QUIZ = {
  math: {
    lang: 'he',
    questions: [
      { q: 'מהי הנגזרת של x²?', options: ['x', '2x', 'x²', '2'], answer: 1, explain: 'לפי כלל החזקה: (xⁿ)\' = n·xⁿ⁻¹, ולכן (x²)\' = 2x.' },
      { q: 'מהי הנגזרת של 5x + 3?', options: ['5', '5x', '3', '8'], answer: 0, explain: 'הנגזרת של 5x היא 5 והנגזרת של קבוע היא 0.' },
      { q: 'מהי הנגזרת של x³?', options: ['x²', '3x', '3x²', '3x³'], answer: 2, explain: "(x³)' = 3x²." },
      { q: "אם f(x) = x·(x+1), מהי f'(x)?", options: ['2x', '2x+1', 'x+1', 'x²+1'], answer: 1, explain: "(x² + x)' = 2x + 1." },
      { q: 'מהי הנגזרת של קבוע, למשל 7?', options: ['7', '1', '0', 'x'], answer: 2, explain: 'קבוע לא משתנה, ולכן הנגזרת שלו היא 0.' },
    ],
  },
  english: {
    lang: 'en',
    questions: [
      { q: 'She ___ to London three times.', options: ['has been', 'have been', 'is been', 'was be'], answer: 0, explain: 'She is third person singular, so we use "has been".' },
      { q: 'I ___ my keys. I cannot find them.', options: ['lose', 'have lost', 'am losing', 'losed'], answer: 1, explain: 'We use the present perfect for a past action with a result now.' },
      { q: 'They ___ lunch yet.', options: ["haven't had", "hasn't had", "didn't have been", "don't had"], answer: 0, explain: 'With "they" we use "have", and the negative is "haven\'t".' },
      { q: '___ you ever seen snow?', options: ['Did', 'Have', 'Has', 'Are'], answer: 1, explain: '"Have you ever + past participle" asks about life experience.' },
      { q: 'He has ___ his homework.', options: ['finish', 'finished', 'finishing', 'finishes'], answer: 1, explain: 'After have/has we use the past participle: finished.' },
    ],
  },
};
export function demoQuiz(d) { return d.kind === 'school' ? QUIZ[d.subjectId] || null : null; }
