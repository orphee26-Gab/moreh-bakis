// Faux serveur d'IA pour les tests locaux : imite l'API Messages (aucun appel réel, aucun coût).
import http from 'node:http';
import fs from 'node:fs';
const LOG = process.env.MOCK_LOG || '/tmp/mock-ai.log';
const port = Number(process.env.PORT || 8787);
const QUIZ = { questions: [1, 2, 3, 4, 5].map((n) => ({ q: `שאלה ${n}: כמה זה ${n}+${n}?`, options: [String(n * 2), String(n * 2 + 1), String(n), String(n * 3)], answer: 0, explain: `${n}+${n} = ${n * 2}` })) };
const CAMERA = { say: 'אני רואה משוואה: 2x + 3 = 11. נתחיל בלבודד את x.', board: '2x + 3 = 11', subject: 'math', topic: 'משוואות ממעלה ראשונה', hints: ['מה אפשר להעביר אגף?', 'חסרו 3 משני האגפים.', 'עכשיו חלקו ב־2.'], solution: ['2x = 8', 'x = 4'], answer: 'x = 4' };
http.createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', '*'); res.setHeader('access-control-allow-methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'POST' || !req.url.endsWith('/v1/messages')) { res.writeHead(404); return res.end('non'); }
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const j = JSON.parse(body || '{}'); const sys = String(j.system || ''); const msgs = j.messages || [];
    const users = msgs.filter((m) => m.role === 'user');
    const last = users[users.length - 1];
    const lastText = typeof last?.content === 'string' ? last.content : (last?.content || []).map((b) => b.text || (b.type === 'image' ? '[image ' + (b.source?.media_type) + ' ' + String(b.source?.data || '').length + ']' : '')).join(' ');
    let kind, text;
    if (sys.includes('Tu crées un quiz')) { kind = 'quiz'; text = JSON.stringify(QUIZ); }
    else if (sys.includes('PHOTO')) { kind = 'camera'; text = JSON.stringify(CAMERA); }
    else if (sys.includes('TÉLÉPHONE')) { kind = 'call'; text = 'שלום! על מה נתרגל היום?'; }
    else if (sys.includes('FORMAT : réponds UNIQUEMENT')) {
      kind = 'tutor'; const n = users.length;
      if (/רמז/.test(lastText)) text = JSON.stringify({ say: 'רמז קטן: חשבו על כלל החזקה.', board: '', kind: 'hint', correct: null, done: false });
      else if (n === 1) text = JSON.stringify({ say: 'נלמד על הנושא. שאלה ראשונה: כמה זה 2 ועוד 2?', board: '2+2=?', kind: 'question', correct: null, done: false });
      else if (n === 2) text = JSON.stringify({ say: 'נכון! שאלה שנייה: כמה זה 3 כפול 3?', board: '3·3=?', kind: 'feedback', correct: true, done: false });
      else if (n === 3) text = JSON.stringify({ say: 'כמעט. התשובה היא 10. שאלה אחרונה: כמה זה 5 ועוד 5?', board: '5+5=10', kind: 'feedback', correct: false, done: false });
      else text = JSON.stringify({ say: 'מצוין! סיכום: חיבור וכפל הם הבסיס.', board: 'סיכום', kind: 'summary', correct: true, done: true });
    } else { kind = 'other'; text = 'OK'; }
    fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), kind, model: j.model, max_tokens: j.max_tokens, cid: req.headers['x-client-id'] || null, version: req.headers['anthropic-version'] || null, key: req.headers['x-api-key'] ? 'présente' : null, direct: req.headers['anthropic-dangerous-direct-browser-access'] || null, nmsgs: msgs.length, last: lastText.slice(0, 80) }) + '\n');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant', model: j.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 } }));
  });
}).listen(port, '127.0.0.1', () => console.log('faux serveur IA sur', port));
