// 크롱과 함께하는 가우스 근력챌린지 - 프런트엔드 (Firebase: Firestore + Authentication)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { CHALLENGE, firebaseConfig } from './config.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EXAMPLE_GOALS = [
  { name: '불스스', target: '덤벨 ○kg / 좌우 각 20회 × 5세트 (약 15분)' },
  { name: '카프레이즈', target: '좌우 각 20회 × 3세트 (약 5분)' },
  { name: '플랭크 & 사이드 플랭크', target: '각 1분 20초 × 2세트 (약 10분)' },
  { name: '매달리기', target: '1분 × 3세트 (약 5분)' },
];

const WEEKDAYS = '일월화수목금토';
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~일
let state = { config: CHALLENGE, participants: [], logs: [] };

const resultsOf = (l) => l.results || (l.done || []).map((name) => ({ name, achieved: true }));
// 'all' = 모든 목표 달성, 'part' = 일부 달성, 'none' = 기록은 했지만 달성 없음
function levelOf(l) {
  const r = resultsOf(l);
  const a = r.filter((x) => x.achieved).length;
  if (r.length && a === r.length) return 'all';
  return a ? 'part' : 'none';
}
const daysLabel = (days) => (days && days.length ? DAY_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAYS[d]).join('·') : '');

// ---------- Firebase ----------
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const notConfigured = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('YOUR_');
// 로컬에서 설정 전이거나 ?emulator 로 열면 Firebase 에뮬레이터(npm run dev)에 연결
const useEmulator = isLocal && (notConfigured || new URLSearchParams(location.search).has('emulator'));
const app = initializeApp(useEmulator ? { apiKey: 'demo-key', projectId: 'demo-crong-gaus', authDomain: 'localhost' } : firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, useEmulator ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
if (useEmulator) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, location.hostname, 8080);
}

// 참가자 1명 = Firebase 로그인 계정 1개. 이메일은 내부용 가짜 주소, 비밀번호는 PIN으로 만들어요.
const emailOf = (loginKey) => `${loginKey}@crong-gaus.example.com`;
const passwordOf = (pin) => `gaus-${pin}`;
const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

let uid = null;
let joining = false;
function me() {
  if (!uid) return null;
  return state.participants.find((x) => x.id === uid) || null;
}

const ERRORS = {
  'auth/invalid-credential': 'PIN이 맞지 않아요.',
  'auth/wrong-password': 'PIN이 맞지 않아요.',
  'auth/user-not-found': 'PIN이 맞지 않아요.',
  'auth/too-many-requests': '시도가 너무 많아요. 잠시 후 다시 해 주세요.',
  'auth/network-request-failed': '네트워크에 연결하지 못했어요.',
  'auth/operation-not-allowed': 'Firebase 콘솔에서 이메일/비밀번호 로그인을 켜 주세요.',
  'permission-denied': '권한이 없어요. 다시 로그인해 주세요.',
  unavailable: '서버에 연결하지 못했어요.',
};
const friendly = (e) => new Error(ERRORS[e && e.code] || (e && e.code ? '오류가 발생했어요. (' + e.code + ')' : (e && e.message) || '오류가 발생했어요.'));

// 실시간 구독: 다른 사람의 기록이 바로 반영돼요
let loaded = { participants: false, logs: false };
let renderQueued = false;
function scheduleRender() {
  if (!loaded.participants || !loaded.logs || renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
function subscribe() {
  onSnapshot(collection(db, 'participants'), (snap) => {
    state.participants = snap.docs.map((d) => ({ id: d.id, goals: [], days: [], ...d.data() }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    loaded.participants = true;
    scheduleRender();
  }, (e) => toast(friendly(e).message));
  onSnapshot(collection(db, 'logs'), (snap) => {
    state.logs = snap.docs.map((d) => ({ id: d.id, results: [], cheers: [], note: '', ...d.data() }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    loaded.logs = true;
    scheduleRender();
  }, (e) => toast(friendly(e).message));
}

function validName(name) {
  if (!name) return '이름을 입력해 주세요.';
  if (name.includes('/') || name === '.' || name === '..' || /^__.*__$/.test(name)) return "이름에 '/' 같은 기호는 쓸 수 없어요.";
  return '';
}
async function join(name, pin, goals, days) {
  name = name.trim().slice(0, 20);
  const bad = validName(name);
  if (bad) throw new Error(bad);
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN은 숫자 4자리로 입력해 주세요.');
  const dup = new Error('이미 등록된 이름이에요. 다른 이름(예: 이름+숫자)을 써 주세요.');
  if (state.participants.some((p) => p.name === name)) throw dup;
  joining = true;
  try {
    if (auth.currentUser) await signOut(auth);
    const loginKey = randomKey();
    const cred = await createUserWithEmailAndPassword(auth, emailOf(loginKey), passwordOf(pin)).catch((e) => { throw friendly(e); });
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'participants', cred.user.uid), { name, loginKey, goals, days, createdAt: new Date().toISOString() });
      batch.set(doc(db, 'names', name), { uid: cred.user.uid });
      await batch.commit();
    } catch (e) {
      await cred.user.delete().catch(() => signOut(auth));
      throw e && e.code === 'permission-denied' ? dup : friendly(e);
    }
    uid = cred.user.uid;
  } finally {
    joining = false;
  }
}
async function login(participantId, pin) {
  const p = state.participants.find((x) => x.id === participantId);
  if (!p || !p.loginKey) throw new Error('참가자를 찾을 수 없어요.');
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN이 맞지 않아요.');
  const cred = await signInWithEmailAndPassword(auth, emailOf(p.loginKey), passwordOf(pin)).catch((e) => { throw friendly(e); });
  uid = cred.user.uid;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

// ---------- 날짜/주차 계산 ----------
const DAY = 86400000;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekOf(dateStr) {
  const diff = Math.floor((parseDate(dateStr) - parseDate(state.config.startDate)) / DAY);
  if (diff < 0) return 0;
  const w = Math.floor(diff / 7) + 1;
  return w > state.config.weeks ? state.config.weeks + 1 : w;
}
function fmtDate(s) {
  const d = new Date(parseDate(s));
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${'일월화수목금토'[d.getUTCDay()]})`;
}
function endDate() {
  const d = new Date(parseDate(state.config.startDate) + (state.config.weeks * 7 - 1) * DAY);
  return d.toISOString().slice(0, 10);
}

// 참가자별 통계: 주차별 운동일수(같은 날 여러 기록은 1회), 인정 횟수(주당 최대 perWeek)
function statsFor(pid) {
  const { weeks, perWeek } = state.config;
  const perWeekDays = Array.from({ length: weeks + 1 }, () => new Set());
  const allDays = new Set();
  for (const l of state.logs) {
    if (l.participantId !== pid) continue;
    allDays.add(l.date);
    const w = weekOf(l.date);
    if (w >= 1 && w <= weeks) perWeekDays[w].add(l.date);
  }
  const weekCounts = perWeekDays.map((s) => s.size);
  const credited = weekCounts.slice(1).reduce((a, c) => a + Math.min(c, perWeek), 0);
  return { weekCounts, credited, totalDays: allDays.size };
}

// ---------- 렌더 ----------
function render() {
  renderMeta();
  renderBoard();
  renderLog();
  renderFeed();
  renderMe();
}

function renderMeta() {
  const { startDate, weeks, perWeek, totalGoal } = state.config;
  const today = todayStr();
  const w = weekOf(today);
  let status;
  if (w === 0) status = `시작까지 D-${Math.round((parseDate(startDate) - parseDate(today)) / DAY)}`;
  else if (w > weeks) status = '챌린지 종료 🎉';
  else status = `${w}주차 진행 중`;
  $('#meta').innerHTML = [
    status,
    `${fmtDate(startDate)} ~ ${fmtDate(endDate())}`,
    `${weeks}주 · 주 ${perWeek}회 · 총 ${totalGoal}회`,
  ].map((t) => `<span class="chip">${esc(t)}</span>`).join('');
}

function renderBoard() {
  const { weeks, perWeek, totalGoal } = state.config;
  const curWeek = weekOf(todayStr());
  const rows = state.participants.map((p) => ({ p, s: statsFor(p.id) }))
    .sort((a, b) => b.s.credited - a.s.credited || b.s.totalDays - a.s.totalDays || a.p.name.localeCompare(b.p.name));

  const doneThisWeek = curWeek >= 1 && curWeek <= weeks ? rows.filter((r) => r.s.weekCounts[curWeek] >= perWeek).length : 0;
  const totalSessions = rows.reduce((a, r) => a + r.s.credited, 0);
  $('#summary').innerHTML = `
    <div class="stat"><b>${rows.length}</b><span>참가자</span></div>
    <div class="stat"><b>${totalSessions}</b><span>누적 인정 횟수</span></div>
    <div class="stat"><b>${doneThisWeek}/${rows.length}</b><span>이번 주 목표 달성</span></div>`;

  if (!rows.length) {
    $('#board').innerHTML = `<div class="card empty">아직 참가자가 없어요.<br/>👤 <b>내 목표</b> 탭에서 첫 번째로 등록해 보세요!</div>`;
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const weekTable = renderWeekTable(rows.map((r) => r.p));
  $('#board').innerHTML = weekTable + rows.map(({ p, s }, i) => {
    const pct = Math.min(100, (s.credited / totalGoal) * 100);
    const thisWeek = curWeek >= 1 && curWeek <= weeks ? s.weekCounts[curWeek] : null;
    const badge = thisWeek === null ? '' : thisWeek >= perWeek
      ? `<span class="badge ok">이번 주 완료 ✅</span>`
      : `<span class="badge">이번 주 ${thisWeek}/${perWeek}</span>`;
    const weekCells = Array.from({ length: weeks }, (_, k) => {
      const w = k + 1;
      const c = s.weekCounts[w];
      const dots = Array.from({ length: perWeek }, (_, j) => `<i class="dot ${j < c ? 'on' : ''}"></i>`).join('');
      return `<div class="week ${w === curWeek ? 'current' : ''}" title="${w}주차: ${c}회"><div class="dots">${dots}</div>${w}</div>`;
    }).join('');
    const goals = p.goals.length
      ? `<details><summary class="muted">목표 보기 (${p.goals.length}개)</summary><ul class="goals-mini">${p.goals.map((g) => `<li><b>${esc(g.name)}</b> ${esc(g.target)}</li>`).join('')}</ul></details>`
      : '';
    return `<div class="card person">
      <div class="top"><span class="rank">${medals[i] || i + 1}</span><span class="name">${esc(p.name)}</span>${badge}
        ${daysLabel(p.days) ? `<span class="muted">${daysLabel(p.days)}</span>` : ''}
        <span class="count">${s.credited}<small class="muted">/${totalGoal}</small></span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="weeks">${weekCells}</div>
      ${goals}
    </div>`;
  }).join('');
}

// 이번 주(또는 선택 주) 요일별 표: 계획한 요일 / 기록 / 달성 여부를 한눈에
let tableWeekOffset = 0;
function renderWeekTable(people) {
  const today = parseDate(todayStr());
  const dow = (new Date(today).getUTCDay() + 6) % 7; // 월=0
  const monday = today - dow * DAY + tableWeekOffset * 7 * DAY;
  const dates = Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY).toISOString().slice(0, 10));
  const w = weekOf(dates[0]);
  const title = w >= 1 && w <= state.config.weeks ? `${w}주차` : w === 0 ? '챌린지 시작 전' : '챌린지 종료 후';
  const icon = { all: '✅', part: '🟡', none: '⚪' };
  const head = dates.map((d) => {
    const isToday = parseDate(d) === today;
    return `<th class="${isToday ? 'today' : ''}">${WEEKDAYS[new Date(parseDate(d)).getUTCDay()]}<br/><small>${Number(d.slice(8))}</small></th>`;
  }).join('');
  const body = people.map((p) => {
    const cells = dates.map((d) => {
      const logs = state.logs.filter((l) => l.participantId === p.id && l.date === d);
      const planned = (p.days || []).includes(new Date(parseDate(d)).getUTCDay());
      const past = parseDate(d) < today;
      let mark = '';
      let cls = planned ? 'planned' : '';
      if (logs.length) {
        const lv = logs.some((l) => levelOf(l) === 'all') ? 'all' : logs.some((l) => levelOf(l) === 'part') ? 'part' : 'none';
        mark = icon[lv];
      } else if (planned) {
        mark = past ? '❌' : '·';
        if (past) cls += ' missed';
      }
      return `<td class="${cls}">${mark}</td>`;
    }).join('');
    return `<tr><th class="who">${esc(p.name)}</th>${cells}</tr>`;
  }).join('');
  return `<div class="card">
    <div class="row"><h3 style="margin:0">📆 ${title} 요일표</h3><span class="spacer"></span>
      <button class="btn ghost small" data-week="-1" aria-label="이전 주">◀</button>
      <button class="btn ghost small" data-week="0">이번 주</button>
      <button class="btn ghost small" data-week="1" aria-label="다음 주">▶</button></div>
    <div class="table-wrap"><table class="wtable"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="muted legend">✅ 목표 전부 달성 · 🟡 일부 달성 · ⚪ 기록만 · <span class="planned-key"></span> 계획한 요일 · ❌ 계획했지만 기록 없음</p>
  </div>`;
}

// 로그인(이 기기에서 나를 선택) 폼
function loginForm(targetId) {
  if (!state.participants.length) {
    return `<div class="card empty">먼저 👤 <b>내 목표</b> 탭에서 참가 등록을 해 주세요.</div>`;
  }
  return `<div class="card">
    <h3>나는 누구인가요?</h3>
    <p class="muted">처음 한 번만 선택하면 이 기기에 기억돼요.</p>
    <form data-login="${targetId}">
      <div class="field"><label>이름</label>
        <select name="id" required>${state.participants.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>PIN (숫자 4자리)</label><input type="password" inputmode="numeric" name="pin" maxlength="4" required /></div>
      <button class="btn block">확인</button>
    </form>
    <p class="muted" style="margin-top:10px">처음이라면 👤 <b>내 목표</b> 탭에서 등록하세요.</p>
  </div>`;
}

function renderLog() {
  const m = me();
  const area = $('#log-area');
  // 입력 중인 내용이 있으면 자동 새로고침으로 덮어쓰지 않음
  if (area.contains(document.activeElement) && area.dataset.for === (m ? m.id : '')) return;
  area.dataset.for = m ? m.id : '';
  if (!m) { area.innerHTML = loginForm('log'); return; }

  const goals = m.goals.length ? m.goals : [];
  area.innerHTML = `<div class="card">
    <div class="row"><h3 style="margin:0">${esc(m.name)}님, 오늘도 득근! 💪</h3></div>
    <form id="log-form" style="margin-top:12px">
      <div class="field"><label>운동한 날짜</label><input type="date" name="date" value="${todayStr()}" required />
        <p class="muted" id="day-hint" style="margin:4px 0 0">${dayHint(m, todayStr())}</p></div>
      <div class="field"><label>목표 달성 체크</label>
        <p class="muted" style="margin:0 0 6px">목표만큼 해냈으면 체크! 못 채운 항목은 체크를 풀면 '미달성'으로 기록돼요.</p>
        ${goals.length ? goals.map((g, i) => `<label class="check"><input type="checkbox" data-goal="${i}" checked />
          <span><b>${esc(g.name)}</b><span class="muted">${esc(g.target)}</span></span><span class="spacer"></span><span class="state"></span></label>`).join('')
          : `<p class="muted">등록된 목표가 없어요. 👤 내 목표 탭에서 추가하거나, 아래에 직접 적어 주세요.</p>`}
        <input type="text" name="extra" placeholder="추가로 한 운동 (선택, 쉼표로 구분)" />
      </div>
      <div class="field"><label>메모 (무게, 컨디션, 한마디 등)</label>
        <textarea name="note" maxlength="500" placeholder="예) 덤벨 8kg으로 올렸다! 마지막 세트 후들후들 🦵"></textarea></div>
      <button class="btn block">기록 저장</button>
    </form>
  </div>
  <h3>내 최근 기록</h3>
  <div>${logItems(state.logs.filter((l) => l.participantId === m.id).slice(-5).reverse()) || '<p class="empty">아직 기록이 없어요.</p>'}</div>`;
}

function dayHint(m, date) {
  if (!date || !m.days || !m.days.length) return '';
  const d = new Date(parseDate(date)).getUTCDay();
  return m.days.includes(d) ? `📌 계획한 운동 요일(${WEEKDAYS[d]})이에요!` : `계획 요일(${daysLabel(m.days)})은 아니지만 기록할 수 있어요.`;
}

function logItems(logs) {
  const m = me();
  const byId = Object.fromEntries(state.participants.map((p) => [p.id, p]));
  return logs.map((l) => {
    const p = byId[l.participantId];
    const w = weekOf(l.date);
    const wLabel = w >= 1 && w <= state.config.weeks ? `${w}주차` : w === 0 ? '사전' : '종료 후';
    const cheered = m && (l.cheers || []).includes(m.name);
    return `<div class="card log-item">
      <div class="head"><span class="who">${esc(p ? p.name : '알 수 없음')}</span>
        <span class="muted">${fmtDate(l.date)} · ${wLabel}</span><span class="spacer"></span>
        ${m && m.id === l.participantId ? `<button class="btn danger small" data-del="${l.id}">삭제</button>` : ''}</div>
      ${resultsHtml(l)}
      ${l.note ? `<p class="note">${esc(l.note)}</p>` : ''}
      <div class="row"><button class="btn ghost small cheer ${cheered ? 'on' : ''}" data-cheer="${l.id}">👏 응원 ${(l.cheers || []).length || ''}</button>
        ${(l.cheers || []).length ? `<span class="muted">${esc(l.cheers.join(', '))}</span>` : ''}</div>
    </div>`;
  }).join('');
}

function resultsHtml(l) {
  const r = resultsOf(l);
  if (!r.length) return '';
  const a = r.filter((x) => x.achieved).length;
  const lv = levelOf(l);
  const badge = lv === 'all' ? `<span class="badge ok">🎯 목표 전부 달성</span>` : `<span class="badge">${a}/${r.length} 달성</span>`;
  return `<div style="margin-top:6px">${badge}</div><ul>${r.map((x) =>
    `<li class="${x.achieved ? '' : 'miss'}" title="${esc(x.target || '')}">${x.achieved ? '✅' : '❌'} ${esc(x.name)}</li>`).join('')}</ul>`;
}

function renderFeed() {
  const sel = $('#feed-filter');
  const cur = sel.value;
  sel.innerHTML = `<option value="">전체 참가자</option>` + state.participants.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  sel.value = state.participants.some((p) => p.id === cur) ? cur : '';
  const logs = state.logs.filter((l) => !sel.value || l.participantId === sel.value)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  $('#feed').innerHTML = logItems(logs) || `<div class="card empty">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요! 🔥</div>`;
}

function daysPicker(days = []) {
  return `<div class="days">${DAY_ORDER.map((d) => `<label class="day"><input type="checkbox" name="days" value="${d}" ${days.includes(d) ? 'checked' : ''}/><span>${WEEKDAYS[d]}</span></label>`).join('')}</div>`;
}
const readDays = (form) => [...form.querySelectorAll('input[name=days]:checked')].map((i) => Number(i.value));

function goalEditor(goals) {
  return `<div id="goal-rows">${goals.map(goalRow).join('')}</div>
    <div class="row"><button type="button" class="btn ghost small" data-add-goal>+ 운동 추가</button>
    <button type="button" class="btn ghost small" data-example>예시로 채우기</button></div>`;
}
function goalRow(g = { name: '', target: '' }) {
  return `<div class="goal-row">
    <input type="text" class="g-name" placeholder="운동 (예: 불스스)" value="${esc(g.name)}" maxlength="40" />
    <input type="text" class="g-target" placeholder="목표 (예: 덤벨 6kg / 좌우 20회 × 5세트)" value="${esc(g.target)}" maxlength="120" />
    <button type="button" class="btn ghost small" data-remove-goal aria-label="삭제">✕</button>
  </div>`;
}
function readGoals(form) {
  return [...form.querySelectorAll('.goal-row')].map((r) => ({ name: $('.g-name', r).value.trim(), target: $('.g-target', r).value.trim() })).filter((g) => g.name);
}

function renderMe() {
  const area = $('#me-area');
  const m = me();
  if (area.contains(document.activeElement) && area.dataset.for === (m ? m.id : '')) return;
  area.dataset.for = m ? m.id : '';
  if (m) {
    const s = statsFor(m.id);
    area.innerHTML = `<div class="card">
      <div class="row"><h3 style="margin:0">${esc(m.name)}님의 목표</h3><span class="spacer"></span>
        <span class="badge">${s.credited}/${state.config.totalGoal}회</span></div>
      <form id="goal-form" style="margin-top:12px">
        <div class="field"><label>운동 요일 (주 ${state.config.perWeek}회 추천)</label>${daysPicker(m.days || [])}</div>
        <div class="field"><label>운동 목표</label>${goalEditor(m.goals.length ? m.goals : [{ name: '', target: '' }])}</div>
        <button class="btn block" style="margin-top:12px">목표 저장</button></form>
    </div>
    <button class="btn ghost block" data-logout>이 기기에서 로그아웃</button>`;
    return;
  }
  area.innerHTML = `<div class="card">
    <h3>참가 등록</h3>
    <p class="muted">이름과 PIN을 정하고, 나만의 운동 목표를 세워 보세요. PIN은 내 기록을 지키는 비밀번호예요.</p>
    <form id="join-form">
      <div class="field"><label>이름 (닉네임)</label><input type="text" name="name" maxlength="20" required placeholder="예) 율은" /></div>
      <div class="field"><label>PIN (숫자 4자리)</label><input type="password" inputmode="numeric" name="pin" maxlength="4" pattern="\\d{4}" required /></div>
      <div class="field"><label>운동 요일 (주 ${state.config.perWeek}회 추천)</label>${daysPicker([2, 4])}</div>
      <div class="field"><label>나의 운동 목표</label>${goalEditor(EXAMPLE_GOALS)}</div>
      <button class="btn block">등록하고 시작하기 🔥</button>
    </form>
  </div>
  ${state.participants.length ? `<p class="muted" style="text-align:center">이미 등록했다면 ✍️ 기록하기 탭에서 이름을 선택하세요.</p>` : ''}`;
}

// ---------- 이벤트 ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.classList.contains('tab')) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === t));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab));
    return;
  }
  if (t.hasAttribute('data-add-goal')) { $('#goal-rows').insertAdjacentHTML('beforeend', goalRow()); return; }
  if (t.hasAttribute('data-remove-goal')) { t.closest('.goal-row').remove(); return; }
  if (t.hasAttribute('data-example')) { $('#goal-rows').innerHTML = EXAMPLE_GOALS.map(goalRow).join(''); return; }
  if (t.dataset.week !== undefined) {
    tableWeekOffset = t.dataset.week === '0' ? 0 : tableWeekOffset + Number(t.dataset.week);
    renderBoard();
    return;
  }
  if (t.hasAttribute('data-logout')) { await signOut(auth); uid = null; render(); toast('로그아웃했어요.'); return; }

  try {
    if (t.dataset.del) {
      // 실수 방지: 한 번 더 눌러야 삭제
      if (t.dataset.armed !== '1') {
        t.dataset.armed = '1';
        t.textContent = '정말 삭제?';
        setTimeout(() => { if (t.isConnected) { t.dataset.armed = ''; t.textContent = '삭제'; } }, 3000);
        return;
      }
      await deleteDoc(doc(db, 'logs', t.dataset.del)).catch((e) => { throw friendly(e); });
      toast('삭제했어요.');
    } else if (t.dataset.cheer) {
      const m = me();
      if (!m) { toast('응원하려면 먼저 ✍️ 기록하기 탭에서 이름을 선택해 주세요.'); return; }
      const log = state.logs.find((l) => l.id === t.dataset.cheer);
      if (!log) { toast('기록을 찾을 수 없어요.'); return; }
      const on = (log.cheers || []).includes(m.name);
      await updateDoc(doc(db, 'logs', log.id), { cheers: on ? arrayRemove(m.name) : arrayUnion(m.name) }).catch((e) => { throw friendly(e); });
    }
  } catch (err) { toast(err.message); }
});

const cleanText = (v, max) => String(v || '').trim().slice(0, max);
const cleanGoals = (goals) => goals.map((g) => ({ name: cleanText(g.name, 40), target: cleanText(g.target, 120) })).filter((g) => g.name).slice(0, 12);

document.addEventListener('submit', async (e) => {
  const f = e.target;
  e.preventDefault();
  const btn = f.querySelector('button:not([type=button])');
  if (btn) btn.disabled = true;
  try {
    if (f.dataset.login) {
      await login(f.elements.id.value, f.elements.pin.value);
      document.activeElement.blur();
      render();
      toast('반가워요! 💪');
    } else if (f.id === 'join-form') {
      await join(f.elements.name.value, f.elements.pin.value, cleanGoals(readGoals(f)), readDays(f));
      document.activeElement.blur();
      render();
      toast('등록 완료! 함께 득근해요 🔥');
    } else if (f.id === 'goal-form') {
      const m = me();
      await updateDoc(doc(db, 'participants', m.id), { goals: cleanGoals(readGoals(f)), days: readDays(f) }).catch((e) => { throw friendly(e); });
      document.activeElement.blur();
      render();
      toast('목표를 저장했어요.');
    } else if (f.id === 'log-form') {
      const m = me();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.elements.date.value)) throw new Error('날짜를 확인해 주세요.');
      const results = [...f.querySelectorAll('input[data-goal]')].map((i) => ({ ...m.goals[Number(i.dataset.goal)], achieved: i.checked }));
      results.push(...f.elements.extra.value.split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({ name, target: '추가 운동', achieved: true })));
      const clean = results.map((r) => ({ name: cleanText(r.name, 40), target: cleanText(r.target, 120), achieved: !!r.achieved })).filter((r) => r.name).slice(0, 20);
      const note = cleanText(f.elements.note.value, 500);
      if (!clean.some((r) => r.achieved) && !note) throw new Error('달성한 운동을 체크하거나 메모를 남겨 주세요.');
      await addDoc(collection(db, 'logs'), { participantId: m.id, date: f.elements.date.value, results: clean, note, createdAt: new Date().toISOString(), cheers: [] })
        .catch((e) => { throw friendly(e); });
      document.activeElement.blur();
      f.reset();
      render();
      toast('기록 완료! 오늘도 득근 💪');
    }
  } catch (err) {
    toast(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

$('#feed-filter').addEventListener('change', renderFeed);
document.addEventListener('change', (e) => {
  if (e.target.matches('#log-form [name=date]')) { const m = me(); if (m) $('#day-hint').textContent = dayHint(m, e.target.value); }
});

// ---------- 시작 ----------
if (notConfigured && !useEmulator) {
  $('#board').innerHTML = `<div class="card empty">Firebase 설정이 아직 없어요.<br/><b>public/config.js</b> 에 Firebase 웹 앱 구성값을 넣어 주세요.</div>`;
} else {
  renderMeta();
  onAuthStateChanged(auth, (user) => {
    uid = user ? user.uid : null;
    if (!joining) scheduleRender();
  });
  subscribe();
}
