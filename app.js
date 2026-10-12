'use strict';
/* 정보검색론 모의시험 화면 */
const GROUPS = { A: '선택형', B: '단답형', C: '서술형' };
const GDESC = { A: '객관식 40문제', B: '빈칸 20 · O/X 10문제', C: '약술 10문제' };
const CIRC = ['①', '②', '③', '④'];
const PASS = 0.6;            // 서술형: 키워드를 이 비율 이상 쓰면 정답으로 인정
const KEY = 'exam_progress'; // 풀던 시험 임시 저장 위치(브라우저)

let Q = [], QMAP = {}, WRONG = {}, CACHE = {}, S = null, RFILTER = 'all', WFILTER = 'open';
const app = document.getElementById('app');

/* ---------- 도우미 ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
const txt = s => String(s).split('\n').map(inline).join('<br>');
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[\s"'“”‘’]+/g, '');
const pad = n => String(n).padStart(2, '0');
const stamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const ts = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtDur = s => s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;
const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }

function mdBlock(t) {
  const L = t.split('\n'); let out = '', i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^\s*\|/.test(l)) {
      const rows = [];
      while (i < L.length && /^\s*\|/.test(L[i])) rows.push(L[i++]);
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const body = rows.filter(r => !/^\s*\|[\s\-:|]+\|\s*$/.test(r));
      out += '<table class="md">' + body.map((r, k) => '<tr>' + cells(r).map(c => k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</table>';
      continue;
    }
    const m = l.match(/^(\s*)(-|\d+\.)\s+(.*)$/);
    if (m) {
      out += `<div class="li" style="margin-left:${Math.floor(m[1].length / 2) * 18}px"><span class="mk">${m[2] === '-' ? '•' : m[2]}</span><span>${inline(m[3])}</span></div>`;
      i++; continue;
    }
    if (l.trim()) out += `<p>${inline(l)}</p>`;
    i++;
  }
  return out;
}

/* ---------- 채점 ---------- */
function answered(q, a) {
  if (q.type === 'choice') return a >= 1;
  if (q.type === 'ox') return a === 'O' || a === 'X';
  if (q.type === 'blank') return Array.isArray(a) && a.some(s => s && s.trim());
  return typeof a === 'string' && a.trim().length > 0;
}
function kwHit(text, alts) { const t = norm(text); return alts.some(a => a.split('&').every(p => t.includes(norm(p)))); }
function passCount(q) { let k = 0; while (k / q.need < PASS) k++; return k; } // 정답으로 인정되는 최소 키워드 수
function essayScore(q, hits) { const s = Math.min(1, hits.filter(Boolean).length / q.need); return { score: s, correct: s >= PASS }; }
function grade(q, a) {
  if (q.type === 'choice') { const ok = a === q.answer; return { correct: ok, score: ok ? 1 : 0, hits: null }; }
  if (q.type === 'ox') { const ok = a === q.answer; return { correct: ok, score: ok ? 1 : 0, hits: null }; }
  if (q.type === 'blank') {
    const n = q.blanks.length, inp = (a || []).map(norm), ok = Array(n).fill(false);
    if (q.unordered) {
      const used = Array(n).fill(false);
      inp.forEach((v, i) => { if (!v) return; for (let g = 0; g < n; g++) if (!used[g] && q.blanks[g].some(x => norm(x) === v)) { used[g] = true; ok[i] = true; break; } });
    } else for (let i = 0; i < n; i++) ok[i] = !!inp[i] && q.blanks[i].some(x => norm(x) === inp[i]);
    const c = ok.filter(Boolean).length;
    return { correct: c === n, score: c / n, hits: ok };
  }
  const hits = q.keywords.map(k => typeof a === 'string' && kwHit(a, k.alts));
  return { ...essayScore(q, hits), hits };
}
function summarize(items) {
  const by = { A: { total: 0, correct: 0 }, B: { total: 0, correct: 0 }, C: { total: 0, correct: 0 } };
  let sc = 0, ok = 0;
  items.forEach(it => { const g = by[QMAP[it.qid].group]; g.total++; sc += it.score; if (it.correct) { ok++; g.correct++; } });
  return { total: items.length, correct: ok, percent: items.length ? Math.round(sc / items.length * 100) : 0, byGroup: by };
}

/* ---------- 저장소: 서버 없이 이 기기의 브라우저 안에 저장 ---------- */
const DB_KEY = 'exam_results_v1';
const ID_RE = /^\d{8}_\d{6}$/;
const isNum = v => typeof v === 'number' && isFinite(v);
function dbLoad() {
  try { const o = JSON.parse(localStorage.getItem(DB_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
}
const dbSave = o => localStorage.setItem(DB_KEY, JSON.stringify(o));
/* 결과 한 건의 형식 검사 (깨진 기록·잘못된 백업 파일이 화면을 망가뜨리지 않게) */
function validResult(d) {
  try {
    if (!d || typeof d.id !== 'string' || !ID_RE.test(d.id) || typeof d.label !== 'string' || typeof d.finishedAt !== 'string' || !isNum(d.durationSec)) return false;
    if (!Array.isArray(d.items) || !d.items.length || !Array.isArray(d.qids) || !d.qids.every(n => QMAP[n])) return false;
    const seen = new Set();
    for (const it of d.items) {
      const q = QMAP[it.qid];
      if (!Number.isInteger(it.qid) || !q || seen.has(it.qid) || typeof it.correct !== 'boolean' || !isNum(it.score) || it.score < 0 || it.score > 1) return false;
      if (q.type === 'essay' && !(Array.isArray(it.hits) && it.hits.length === q.keywords.length)) return false;
      seen.add(it.qid);
    }
    const s = d.summary;
    if (!s || !isNum(s.total) || !isNum(s.correct) || !isNum(s.percent) || !s.byGroup) return false;
    return 'ABC'.split('').every(k => s.byGroup[k] && isNum(s.byGroup[k].total) && isNum(s.byGroup[k].correct));
  } catch (e) { return false; }
}
function calcStats(db) { // 저장된 모든 결과를 시간순으로 읽어 문제별 오답 기록 계산
  const stats = {};
  Object.keys(db).sort().forEach(id => {
    const d = db[id]; if (!validResult(d)) return;
    for (const it of d.items) {
      const s = stats[it.qid] || (stats[it.qid] = { wrong: 0, right: 0, last: null, lastAt: null });
      if (it.correct) { s.right++; s.last = 'right'; } else { s.wrong++; s.last = 'wrong'; }
      s.lastAt = d.finishedAt;
    }
  });
  return stats;
}
async function getJSON(u) {
  if (!u.startsWith('/api/')) return (await fetch(u)).json();
  const db = dbLoad(), ids = Object.keys(db).filter(id => validResult(db[id])).sort();
  if (u === '/api/results') return ids.map(id => { const d = db[id]; return { id, label: d.label, mode: d.mode, finishedAt: d.finishedAt, durationSec: d.durationSec, summary: d.summary }; });
  if (u === '/api/wrong') return { stats: calcStats(db) };
  const m = u.match(/^\/api\/results\/(.+)$/);
  return m && ids.includes(m[1]) ? db[m[1]] : { error: 'not found' };
}
async function postResult(d) {
  try {
    if (!validResult(d)) throw new Error('bad');
    const db = dbLoad(); db[d.id] = d; dbSave(db); WRONG = calcStats(db); return true;
  } catch (e) { alert('결과를 저장하지 못했습니다. 브라우저 저장 공간이 부족하거나 시크릿(사생활 보호) 모드일 수 있어요.'); return false; }
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(dbLoad(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `정보검색_시험기록_${stamp(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importBackup(file) {
  try {
    let o = JSON.parse(await file.text());
    if (Array.isArray(o)) o = Object.fromEntries(o.filter(x => x && x.id).map(x => [x.id, x]));
    const db = dbLoad(); let ok = 0, bad = 0;
    for (const [id, d] of Object.entries(o)) { if (d && d.id === id && validResult(d)) { db[id] = d; ok++; } else bad++; }
    dbSave(db); toast(`기록 ${ok}개를 불러왔습니다${bad ? ` (읽을 수 없는 ${bad}개는 건너뜀)` : ''}.`);
  } catch (e) { alert('백업 파일을 읽을 수 없습니다. 이 사이트에서 내려받은 백업 파일이 맞는지 확인하세요.'); }
  route();
}
const unresolved = () => Object.entries(WRONG).filter(([, s]) => s.wrong > 0 && s.last === 'wrong').map(([n]) => +n).sort((a, b) => a - b);

/* ---------- 시험 시작/진행 ---------- */
function interleave(nums, shuffle) {
  const g = { A: [], B: [], C: [] };
  [...nums].sort((a, b) => a - b).forEach(n => g[QMAP[n].group].push(n));
  if (shuffle) Object.values(g).forEach(shuf);
  const out = []; let more = true;
  while (more) { more = false; for (const k of 'ABC') if (g[k].length) { out.push(g[k].shift()); more = true; } }
  return out;
}
const saveS = () => localStorage.setItem(KEY, JSON.stringify(S));
function startExam(qids, label, mode) {
  if (!qids.length) { toast('풀 문제가 없습니다.'); return; }
  if (S && !confirm('풀던 시험이 있습니다. 새로 시작하면 지금까지의 답안은 사라집니다. 계속할까요?')) return;
  S = { qids, answers: {}, idx: 0, label, mode, startedAtMs: Date.now() };
  saveS();
  if (location.hash === '#exam') route(); else location.hash = '#exam';
}
async function submitExam() {
  const un = S.qids.filter(n => !answered(QMAP[n], S.answers[n])).length;
  if (!confirm(un ? `아직 답하지 않은 문제가 ${un}개 있습니다. 그래도 제출할까요?` : '제출하고 채점할까요?')) return;
  const items = S.qids.map(n => {
    const q = QMAP[n]; let a = S.answers[n];
    if (q.type === 'blank' && Array.isArray(a)) a = q.blanks.map((_, i) => a[i] || ''); // 건너뛴 칸은 빈 글자로
    const g = grade(q, a); return { qid: n, group: q.group, answer: a === undefined ? null : a, correct: g.correct, score: g.score, hits: g.hits }; });
  const now = new Date();
  const d = { id: stamp(now), label: S.label, mode: S.mode, startedAt: ts(new Date(S.startedAtMs)), finishedAt: ts(now), durationSec: Math.round((now - S.startedAtMs) / 1000), qids: S.qids, items, summary: summarize(items) };
  if (!await postResult(d)) return;
  CACHE[d.id] = d; S = null; localStorage.removeItem(KEY);
  location.hash = '#result/' + d.id;
}

/* ---------- 화면: 홈 ---------- */
function viewHome(recent) {
  const un = unresolved().length;
  const total = Q.length;
  app.innerHTML = `
  <h1>정보검색론 중간고사 모의시험</h1>
  ${S ? `<div class="card banner"><b>풀던 시험이 있어요.</b> (${esc(S.label)} · ${S.qids.filter(n => answered(QMAP[n], S.answers[n])).length}/${S.qids.length}문제 답함)
     <div class="row" style="margin-top:10px"><button class="primary" data-act="resume">이어서 풀기</button><button data-act="discard">버리기</button></div></div>` : ''}
  <div class="card">
    <h2 style="margin-top:0">시험 보기</h2>
    <p class="sub">${total}문제를 <b>선택형 → 단답형 → 서술형</b> 순서로 번갈아 가며 풉니다. 끝까지 푼 뒤 제출하면 한 번에 채점됩니다.</p>
    <div class="types">
      ${['A', 'B', 'C'].map(k => `<label><input type="checkbox" class="tsel" value="${k}" checked><span class="badge g${k}">${GROUPS[k]}</span> ${GDESC[k]}</label>`).join('')}
      <label><input type="checkbox" id="shuffle"> 각 유형 안에서 문제 순서 섞기</label>
    </div>
    <div class="row" style="margin-top:8px"><button class="primary" data-act="start">선택한 유형으로 시작</button>
    <span class="sub">(전부 체크 = 80문제 전체)</span></div>
  </div>
  <div class="card">
    <h2 style="margin-top:0">오답노트로 복습</h2>
    <p class="sub">아직 틀리는 문제 <b>${un}개</b> ${un ? '' : '(시험을 치르면 여기에 쌓입니다)'}</p>
    <button data-act="startWrong" ${un ? '' : 'disabled'}>오답노트 문제만 다시 풀기</button>
  </div>
  <div class="card"><h2 style="margin-top:0">최근 시험</h2>${recent.length ? histTable(recent.slice(0, 5)) : '<p class="sub">아직 본 시험이 없습니다.</p>'}
  ${recent.length > 5 ? '<a href="#history">전체 기록 보기 →</a>' : ''}</div>`;
}
function histTable(list) {
  return `<table><tr><th>날짜</th><th>구성</th><th>점수</th><th>정답</th><th>시간</th></tr>${list.map(r =>
    `<tr class="click" data-act="open" data-id="${r.id}"><td>${esc(r.finishedAt || '')}</td><td>${esc(r.label || '')}</td><td><b>${r.summary.percent}점</b></td><td>${r.summary.correct}/${r.summary.total}</td><td>${fmtDur(r.durationSec || 0)}</td></tr>`).join('')}</table>`;
}

/* ---------- 화면: 시험 ---------- */
function qBody(q, ans) {
  if (q.type === 'blank') {
    const re = /\(\s*([①②③④])\s*\)/g; let out = '', last = 0, m;
    while ((m = re.exec(q.text))) {
      const i = CIRC.indexOf(m[1]);
      out += txt(q.text.slice(last, m.index)) + `${m[1]}<input class="blank" data-i="${i}" autocomplete="off" value="${esc((ans || [])[i] || '')}">`;
      last = re.lastIndex;
    }
    return out + txt(q.text.slice(last));
  }
  return txt(q.text);
}
function viewExam() {
  if (!S) { location.hash = '#home'; return; }
  const N = S.qids.length, num = S.qids[S.idx], q = QMAP[num], a = S.answers[num];
  const done = S.qids.filter(n => answered(QMAP[n], S.answers[n])).length;
  let input = '';
  if (q.type === 'choice') input = q.options.map((o, i) => `<div class="opt ${a === i + 1 ? 'sel' : ''}" data-act="pick" data-v="${i + 1}"><span class="no">${CIRC[i]}</span><span>${inline(o)}</span></div>`).join('');
  else if (q.type === 'ox') input = `<div class="oxs">${['O', 'X'].map(v => `<div class="opt ${a === v ? 'sel' : ''}" data-act="pick" data-v="${v}">${v}</div>`).join('')}</div>`;
  else if (q.type === 'essay') input = `<textarea id="essay" placeholder="여기에 답안을 쓰세요. 핵심 용어를 빠짐없이 넣어 보세요.">${esc(a || '')}</textarea>`;
  app.innerHTML = `
  <div class="row"><span class="badge g${q.group}">${GROUPS[q.group]}</span><span class="grow sub">${esc(S.label)}</span><b>${S.idx + 1} / ${N}</b></div>
  <div class="bar"><i style="width:${(S.idx + 1) / N * 100}%"></i></div>
  <div class="grid" id="grid">${S.qids.map((n, i) => `<button data-act="jump" data-i="${i}" class="${i === S.idx ? 'cur' : answered(QMAP[n], S.answers[n]) ? 'done' : ''}">${i + 1}</button>`).join('')}</div>
  <div class="card">
    <div class="sub">문제 ${q.num}번 · ${q.type === 'blank' ? '빈칸에 알맞은 말을 쓰세요' : q.type === 'ox' ? '맞으면 O, 틀리면 X' : q.type === 'essay' ? '약술형' : '알맞은 것을 고르세요 (숫자키 1~4)'}</div>
    <div class="qtext">${qBody(q, a)}</div>
    ${input}
  </div>
  <div class="nav"><button data-act="prev" ${S.idx === 0 ? 'disabled' : ''}>← 이전</button><span class="sub" style="align-self:center">답한 문제 ${done}/${N}</span>
  ${S.idx < N - 1 ? '<button class="primary" data-act="next">다음 →</button>' : '<button class="primary" data-act="submit">제출하고 채점</button>'}</div>
  ${S.idx < N - 1 ? '<div style="text-align:right;margin-top:10px"><button data-act="submit">지금 제출</button></div>' : ''}`;
  const f = app.querySelector('input.blank,textarea'); if (f) f.focus({ preventScroll: true });
}
function refreshGrid() {
  const bs = document.querySelectorAll('#grid button');
  S.qids.forEach((n, i) => { if (bs[i]) bs[i].className = i === S.idx ? 'cur' : answered(QMAP[n], S.answers[n]) ? 'done' : ''; });
}

/* ---------- 화면: 결과 ---------- */
function myAnswerHtml(q, it) {
  const a = it.answer;
  if (q.type === 'choice') return a >= 1 ? `${CIRC[a - 1]} ${esc(q.options[a - 1])}` : '(답하지 않음)';
  if (q.type === 'ox') return a || '(답하지 않음)';
  if (q.type === 'blank') return q.blanks.map((_, i) => `${CIRC[i]} ${esc((a || [])[i] || '(빈칸)')} ${it.hits && it.hits[i] ? '✓' : '✗'}`).join('   ');
  return a ? esc(a) : '(답하지 않음)';
}
function itemCard(it) {
  const q = QMAP[it.qid], ok = it.correct;
  let body = `<div class="qtext" style="font-size:16px">${q.type === 'blank' ? txt(q.text) : txt(q.text)}</div>`;
  if (q.type === 'choice') body += `<div class="sub">${q.options.map((o, i) => `${CIRC[i]} ${esc(o)}`).join('<br>')}</div>`;
  body += `<div class="ans me"><b>내 답:</b> ${myAnswerHtml(q, it)}</div>`;
  if (q.type === 'essay') {
    body += `<div><b>채점 키워드</b> <span class="sub">(${q.need}개 이상 쓰면 만점(100%), ${passCount(q)}개 이상이면 정답으로 인정돼요. 채점이 이상하면 체크를 직접 바꿀 수 있어요)</span>` +
      q.keywords.map((k, i) => `<label class="kw ${it.hits[i] ? 'hit' : 'miss'}"><input type="checkbox" class="kwchk" data-q="${it.qid}" data-k="${i}" ${it.hits[i] ? 'checked' : ''}><span>${esc(k.label)}</span></label>`).join('') + '</div>';
    body += `<details><summary>모범답안 보기</summary><div class="ans right">${mdBlock(q.answerText)}</div></details>`;
  } else {
    if (!ok || q.type === 'blank') body += `<div class="ans right"><b>정답:</b> ${txt(q.answerText)}</div>`;
    if (q.explanation) body += `<div class="expl">해설: ${txt(q.explanation)}</div>`;
  }
  const pct = q.type === 'essay' ? ` · ${Math.round(it.score * 100)}%` : '';
  return `<div class="card item ${ok ? 'ok' : 'bad'}"><div class="row"><span class="badge">문제 ${q.num}</span><span class="badge g${q.group}">${GROUPS[q.group]}</span><span class="res">${ok ? '정답' : '오답'}${pct}</span></div>${body}</div>`;
}
async function viewResult(id) {
  let d = CACHE[id];
  if (!d) { d = await getJSON('/api/results/' + id); if (d.error) { app.innerHTML = '<p>결과를 찾을 수 없습니다.</p>'; return; } CACHE[id] = d; }
  if (location.hash !== '#result/' + id) return;
  const s = d.summary, bad = d.items.filter(i => !i.correct);
  const shown = RFILTER === 'bad' ? bad : d.items;
  app.innerHTML = `
  <h1>시험 결과</h1>
  <div class="card">
    <div class="sub">${esc(d.label)} · ${esc(d.finishedAt)} · ${fmtDur(d.durationSec)}</div>
    <div class="score">${s.percent}점 <span style="font-size:20px;font-weight:600;color:var(--sub)">정답 ${s.correct} / ${s.total}</span></div>
    <p class="sub" style="margin:6px 0 0">점수는 서술형·빈칸의 부분점수까지 평균낸 값이라, '정답 개수'로 계산한 비율과 다를 수 있어요. (서술형은 키워드 ${PASS * 100}% 이상이면 '정답'으로 세고, 점수에는 쓴 만큼만 반영돼요.)</p>
    <table style="margin-top:12px"><tr><th>유형</th><th>정답</th><th>비율</th></tr>${['A', 'B', 'C'].filter(k => s.byGroup[k].total).map(k => `<tr><td><span class="badge g${k}">${GROUPS[k]}</span></td><td>${s.byGroup[k].correct} / ${s.byGroup[k].total}</td><td>${Math.round(s.byGroup[k].correct / s.byGroup[k].total * 100)}%</td></tr>`).join('')}</table>
    <div class="row" style="margin-top:14px">
      <button class="primary" data-act="retakeBad" data-id="${id}" ${bad.length ? '' : 'disabled'}>틀린 ${bad.length}문제만 다시 풀기</button>
      <button data-act="retakeSame" data-id="${id}">같은 문제 처음부터 다시 풀기</button>
      <a class="btn" href="#wrong">오답노트</a>
    </div>
    <p class="sub" style="margin-bottom:0">이 결과는 <b>이 기기(브라우저)</b>에 저장되었고, 오답노트에도 반영되었습니다.</p>
  </div>
  <div class="row" style="margin:6px 0 10px"><b class="grow">문제별 확인</b>
    <label><input type="radio" name="rf" value="all" ${RFILTER === 'all' ? 'checked' : ''}> 전체</label>
    <label><input type="radio" name="rf" value="bad" ${RFILTER === 'bad' ? 'checked' : ''}> 오답만</label></div>
  ${shown.map(itemCard).join('') || '<p class="sub">표시할 문제가 없습니다. 🎉</p>'}`;
}
let saveTimer;
function onKwToggle(el) {
  const d = CACHE[location.hash.split('/')[1]]; if (!d) return;
  const it = d.items.find(i => i.qid === +el.dataset.q), q = QMAP[it.qid];
  it.hits[+el.dataset.k] = el.checked;
  Object.assign(it, essayScore(q, it.hits));
  d.summary = summarize(d.items);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => postResult(d).then(ok => ok && toast('채점 수정 내용을 저장했습니다.')), 400);
  const y = scrollY; viewResult(d.id).then(() => scrollTo(0, y));
}

/* ---------- 화면: 기록 / 오답노트 ---------- */
async function viewHistory() {
  const list = (await getJSON('/api/results')).reverse();
  app.innerHTML = `<h1>시험 기록</h1><div class="card">${list.length ? histTable(list) : '<p class="sub">아직 본 시험이 없습니다.</p>'}</div>
  <div class="card"><b>기록 백업</b>
    <p class="sub">기록은 <b>지금 쓰는 기기의 브라우저 안</b>에만 저장됩니다. 브라우저 데이터를 지우거나 다른 기기로 옮기면 사라지니, 가끔 백업 파일을 내려받아 두세요.</p>
    <div class="row"><button data-act="export">백업 파일 내려받기</button><button data-act="import">백업 파일 불러오기</button></div>
    <input type="file" id="imp" accept=".json,application/json" hidden></div>`;
}
function viewWrong() {
  const all = Object.entries(WRONG).filter(([, s]) => s.wrong > 0).map(([n, s]) => ({ n: +n, s }));
  const open = all.filter(x => x.s.last === 'wrong').sort((a, b) => b.s.wrong - a.s.wrong || a.n - b.n);
  const solved = all.filter(x => x.s.last !== 'wrong').sort((a, b) => a.n - b.n);
  const list = WFILTER === 'open' ? open : [...open, ...solved];
  app.innerHTML = `<h1>오답노트</h1>
  <div class="card"><div class="row"><div class="grow">아직 틀리는 문제 <span class="stat-bad">${open.length}개</span> · 다시 맞혀서 해결한 문제 <span class="stat-ok">${solved.length}개</span></div>
  <button class="primary" data-act="startWrong" ${open.length ? '' : 'disabled'}>아직 틀리는 문제 다시 풀기</button></div>
  <label style="display:block;margin-top:8px"><input type="checkbox" id="wsolved" ${WFILTER === 'all' ? 'checked' : ''}> 해결한 문제도 같이 보기</label>
  <p class="sub" style="margin-bottom:0">가장 최근 시험에서 맞히면 '해결'로 바뀝니다. 기록은 이 기기의 브라우저에 저장돼요 ('시험 기록' 화면에서 백업할 수 있어요).</p></div>
  ${list.map(({ n, s }) => {
    const q = QMAP[n], solvedNow = s.last !== 'wrong';
    let h = `<div class="qtext" style="font-size:16px">${txt(q.text)}</div>`;
    if (q.type === 'choice') h += `<div class="sub">${q.options.map((o, i) => `${CIRC[i]} ${esc(o)}`).join('<br>')}</div>`;
    h += q.type === 'essay' ? `<details><summary>모범답안 보기</summary><div class="ans right">${mdBlock(q.answerText)}</div></details>` : `<div class="ans right"><b>정답:</b> ${txt(q.answerText)}</div>`;
    if (q.type !== 'essay' && q.explanation) h += `<div class="expl">해설: ${txt(q.explanation)}</div>`;
    return `<div class="card item ${solvedNow ? 'ok' : 'bad'}"><div class="row"><span class="badge">문제 ${n}</span><span class="badge g${q.group}">${GROUPS[q.group]}</span>
      <span class="stat-bad">오답 ${s.wrong}회</span><span class="stat-ok">정답 ${s.right}회</span><span class="sub">${solvedNow ? '✔ 해결' : '미해결'}</span></div>${h}</div>`;
  }).join('') || '<p class="sub">오답노트가 비어 있습니다. 시험을 치르면 틀린 문제가 자동으로 쌓입니다.</p>'}`;
}

/* ---------- 이벤트 ---------- */
const ACT = {
  start() {
    const ks = [...document.querySelectorAll('.tsel:checked')].map(e => e.value);
    if (!ks.length) { toast('유형을 하나 이상 선택하세요.'); return; }
    const nums = Q.filter(q => ks.includes(q.group)).map(q => q.num);
    const label = ks.length === 3 ? '전체 80문제 (유형 교차)' : ks.map(k => GROUPS[k]).join('+') + ` ${nums.length}문제`;
    startExam(interleave(nums, document.getElementById('shuffle').checked), label, 'mix');
  },
  startWrong() { const u = unresolved(); startExam(interleave(u, false), `오답노트 다시 풀기 (${u.length}문제)`, 'wrong'); },
  resume() { location.hash = '#exam'; },
  discard() { if (confirm('풀던 시험을 버릴까요?')) { S = null; localStorage.removeItem(KEY); route(); } },
  pick(el) { const q = QMAP[S.qids[S.idx]], v = q.type === 'choice' ? +el.dataset.v : el.dataset.v; S.answers[q.num] = S.answers[q.num] === v ? undefined : v; saveS(); viewExam(); },
  jump(el) { S.idx = +el.dataset.i; saveS(); viewExam(); scrollTo(0, 0); },
  prev() { S.idx--; saveS(); viewExam(); scrollTo(0, 0); },
  next() { S.idx++; saveS(); viewExam(); scrollTo(0, 0); },
  submit: submitExam,
  open(el) { location.hash = '#result/' + el.dataset.id; },
  async retakeBad(el) { const d = CACHE[el.dataset.id]; const q = d.items.filter(i => !i.correct).map(i => i.qid); startExam(interleave(q, false), `틀린 문제 다시 풀기 (${q.length}문제)`, 'retry'); },
  export: exportBackup,
  import() { document.getElementById('imp').click(); },
  retakeSame(el) { const d = CACHE[el.dataset.id]; startExam(d.qids.slice(), `${d.label} 다시 풀기`, 'redo'); },
};
document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t && ACT[t.dataset.act]) ACT[t.dataset.act](t, e); });
document.addEventListener('input', e => {
  if (!S || location.hash !== '#exam') return;
  const num = S.qids[S.idx], q = QMAP[num];
  if (e.target.classList.contains('blank')) { const a = S.answers[num] || (S.answers[num] = []); a[+e.target.dataset.i] = e.target.value; }
  else if (e.target.id === 'essay') S.answers[num] = e.target.value;
  else return;
  saveS(); refreshGrid();
});
document.addEventListener('change', e => {
  if (e.target.id === 'imp') { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; }
  else if (e.target.classList.contains('kwchk')) onKwToggle(e.target);
  else if (e.target.name === 'rf') { RFILTER = e.target.value; route(); }
  else if (e.target.id === 'wsolved') { WFILTER = e.target.checked ? 'all' : 'open'; viewWrong(); }
});
document.addEventListener('keydown', e => {
  if (!S || location.hash !== '#exam') return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') { if (e.key === 'Enter' && tag === 'input' && S.idx < S.qids.length - 1) { e.preventDefault(); ACT.next(); } return; }
  const q = QMAP[S.qids[S.idx]];
  if (e.key === 'ArrowRight' && S.idx < S.qids.length - 1) ACT.next();
  else if (e.key === 'ArrowLeft' && S.idx > 0) ACT.prev();
  else if (q.type === 'choice' && /^[1-4]$/.test(e.key)) ACT.pick({ dataset: { v: e.key } });
  else if (q.type === 'ox' && /^[oOxX]$/.test(e.key)) ACT.pick({ dataset: { v: e.key.toUpperCase() } });
});

/* ---------- 라우터 ---------- */
async function route() {
  const h = location.hash.replace(/^#/, '') || 'home';
  const [page, arg] = h.split('/');
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === page));
  window.scrollTo(0, 0);
  try {
    if (page === 'exam') viewExam();
    else if (page === 'result') await viewResult(arg);
    else if (page === 'history') await viewHistory();
    else if (page === 'wrong') { WRONG = (await getJSON('/api/wrong')).stats || {}; viewWrong(); }
    else { const [, w] = await Promise.all([0, getJSON('/api/wrong')]); WRONG = w.stats || {}; viewHome((await getJSON('/api/results')).reverse()); }
  } catch (err) { app.innerHTML = `<div class="card bad">화면을 불러오지 못했습니다. 새로고침 해 보세요.<br><span class="sub">${esc(err)}</span></div>`; }
}
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', e => { if (S && location.hash === '#exam') saveS(); });

(async function init() {
  try {
    Q = await getJSON('questions.json');
    Q.forEach(q => QMAP[q.num] = q);
    try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
    if (S && !S.qids.every(n => QMAP[n])) S = null;
    route();
  } catch (e) { app.textContent = '문제를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침 하세요. (파일을 직접 열면 안 되고, 웹 주소로 접속해야 합니다)'; }
})();
