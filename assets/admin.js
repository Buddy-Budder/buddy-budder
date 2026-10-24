import { ADMIN_PIN, EVENT_NAME } from "./firebase-config.js";
import {
  ensureState, watchState, watchTruth, watchGuesses,
  saveParticipants, setPhase, resetPerson,
  getTruthOnce, getGuessesOnce, computeScores, nameOf,
} from "./db.js";
import { watchPlayers, resetPlayer, setDeadline, setTruthOpen } from "./auth-db.js";
import { uiAlert, uiConfirm, uiPrompt } from "./ui.js";

const app = document.getElementById("app");
const phaseTag = document.getElementById("phaseTag");

let state = null, truth = {}, guesses = [], registered = {};
const PHASE_TH = { setup: "ตั้งค่า 🔧", open: "เปิดให้ทาย 🟢", revealed: "เฉลยแล้ว 🏆" };

/* ---- ประตูผู้ดูแล ---- */
// เข้าได้ 2 ทาง: (1) ล็อกอินด้วยชื่อ Admin จากหน้า Login  (2) กรอกรหัสผู้ดูแล 2004 (สำรอง)
const authedAdmin = localStorage.getItem("bb_auth") === "1" && localStorage.getItem("bb_role") === "admin";
if (sessionStorage.getItem("bb_admin") === "1" || authedAdmin) {
  if (authedAdmin) sessionStorage.setItem("bb_admin", "1");
  start();
} else { gate(); }

function gate() {
  app.innerHTML = `
    <div class="card" style="max-width:380px;margin:40px auto">
      <h2>เข้าสู่แผงผู้ดูแล</h2>
      <p class="sub">ใส่รหัสผู้ดูแล</p>
      <input type="password" id="pin" placeholder="รหัสผ่าน" autofocus>
      <div id="err"></div><div style="height:12px"></div>
      <button class="btn big" id="ok">เข้าสู่ระบบ</button>
    </div>`;
  const go = () => {
    if (document.getElementById("pin").value === ADMIN_PIN) { sessionStorage.setItem("bb_admin","1"); start(); }
    else document.getElementById("err").innerHTML = "<div class='note'>รหัสไม่ถูกต้อง</div>";
  };
  document.getElementById("ok").onclick = go;
  document.getElementById("pin").onkeydown = (e) => e.key === "Enter" && go();
}

async function start() {
  await ensureState();
  watchState((s) => { state = s; render(); });
  watchTruth((m) => { truth = m; render(); });
  watchGuesses((a) => { guesses = a; render(); });
  watchPlayers((ids) => { registered = ids; render(); });
}

function render() {
  if (!state) return;
  phaseTag.textContent = PHASE_TH[state.phase] || state.phase;
  const P = state.participants || [];
  const tCount = Object.keys(truth).length;
  const gCount = guesses.length;

  app.innerHTML = `
    ${sectionPlayers(P, tCount, gCount)}
    ${sectionSettings()}
    ${state.phase === "revealed" ? sectionResults(P) : ""}`;

  wirePlayers(P);
  wireSettings();
}

// ปุ่มออกจากระบบย้ายไปอยู่ที่ท้าย sidebar — ผูกครั้งเดียว (อยู่นอก #app จึงไม่ถูก render ทับ)
document.getElementById("logout").onclick = () => {
  sessionStorage.removeItem("bb_admin");
  localStorage.removeItem("bb_me");
  localStorage.removeItem("bb_auth");
  localStorage.removeItem("bb_role");
  location.href = "index.html";
};

/* ---- 1. จัดการผู้เล่น & สถานะเกม (รวมรายชื่อ + ความคืบหน้าเป็นการ์ดเดียว) ---- */
function sectionPlayers(P, t, g) {
  const n = P.length;
  let ctrl = "";
  if (state.phase === "setup")
    ctrl = `<button class="btn big" id="toOpen" ${n<2?"disabled":""}>🟢 เปิดให้ทุกคนทายผล</button>
            ${n<2?"<p class='muted center'>ต้องมีผู้เล่นอย่างน้อย 2 คน</p>":""}`;
  else if (state.phase === "open")
    ctrl = `<div class="good">🟢 กำลังเปิดรับคำตอบ — ผู้เล่นทายได้${deadlineNote()}</div>`;
  else
    ctrl = `<div class="good">🏆 เฉลยแล้ว — ทุกคนเห็นผลคะแนนแล้ว</div><div style="height:10px"></div>
            <button class="btn ghost" id="toOpen">↩︎ กลับไปเปิดรับคำตอบอีกครั้ง</button>`;

  const rows = P.map((p) => {
    const tc = truth[p.id] ? `<span class="tag yes">✓</span>` : `<span class="tag no">ยัง</span>`;
    const gc = guesses.some((x)=>x.id===p.id) ? `<span class="tag yes">✓</span>` : `<span class="tag no">ยัง</span>`;
    const rc = registered[p.id]
      ? `<span class="tag yes">มีรหัส</span> <button class="btn ghost" data-resetpin="${p.id}" style="padding:4px 9px;font-size:.78rem">รีเซ็ตรหัส</button>`
      : `<span class="tag no">ยังไม่ตั้ง</span>`;
    return `<tr><td>${esc(p.name)}</td><td>${tc}</td><td>${gc}</td><td>${rc}</td>
      <td style="white-space:nowrap">
        <button class="btn ghost" data-ans="${p.id}" style="padding:5px 10px;font-size:.82rem">📋 ผลการตอบ</button>
        <button class="btn ghost" data-edit="${p.id}" style="padding:5px 10px;font-size:.82rem">✏️ แก้ไข</button>
        <button class="btn ghost" data-reset="${p.id}" style="padding:5px 10px;font-size:.82rem">ล้างคำตอบ</button>
        <button class="btn ghost" data-del="${p.id}" style="padding:5px 10px;font-size:.82rem;color:#dc2626">🗑️ ลบ</button>
      </td></tr>`;
  }).join("");

  return `<div class="card"><h2>👥 จัดการผู้เล่น & สถานะเกม (${n} คน)</h2>
    <p class="sub">เพิ่ม / แก้ไข / ลบผู้เล่น และดูสดว่าใครกรอกเฉลย · ทาย · ตั้งรหัสแล้วบ้าง</p>
    <div class="stats" style="margin-bottom:14px">
      <div class="stat"><b>${n}</b><span>ผู้เล่น</span></div>
      <div class="stat"><b>${t}</b><span>กรอกเฉลยแล้ว</span></div>
      <div class="stat"><b>${g}</b><span>ทายแล้ว</span></div>
    </div>
    ${ctrl}
    <div style="height:16px"></div>
    <div class="row" style="justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
      <p class="sub" style="margin:0">คอลัมน์ "รหัสผ่าน" = ตั้งรหัส 4 หลักแล้วหรือยัง · ลืมรหัสกด "รีเซ็ตรหัส"</p>
      <button class="btn" id="addPlayer">➕ เพิ่มผู้เล่น</button>
    </div>
    ${n ? `<table><thead><tr><th>ชื่อ</th><th>เฉลย</th><th>ทาย</th><th>รหัสผ่าน</th><th>จัดการ</th></tr></thead><tbody>${rows}</tbody></table>`
        : `<p class="muted">ยังไม่มีผู้เล่น — กด "➕ เพิ่มผู้เล่น" เพื่อเริ่ม</p>`}
  </div>`;
}

function wirePlayers(P) {
  const o = document.getElementById("toOpen"); if (o) o.onclick = () => setPhase("open");

  document.querySelectorAll("[data-ans]").forEach((b) => { b.onclick = () => showAnswers(b.dataset.ans); });

  // เพิ่มผู้เล่นใหม่ — สร้างไอดีใหม่แล้วต่อท้ายรายชื่อเดิม (กันชื่อซ้ำ)
  const add = document.getElementById("addPlayer");
  if (add) add.onclick = async () => {
    const raw = await uiPrompt("ตั้งชื่อผู้เล่นคนใหม่ได้เลย", { title: "เพิ่มผู้เล่น", icon: "🎉", placeholder: "เช่น สมชาย" });
    if (raw === null) return;
    const name = raw.trim();
    if (!name) return;
    if (P.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) { await uiAlert(`มีชื่อ "${name}" อยู่แล้ว`, { title: "ชื่อซ้ำ", icon: "⚠️" }); return; }
    const id = "p" + Math.random().toString(36).slice(2,8);
    await saveParticipants([...P, { id, name }]);
  };

  // แก้ไขชื่อ — คงไอดีเดิมไว้ คำตอบ/รหัสที่ผูกกับคนนี้จึงไม่หาย
  document.querySelectorAll("[data-edit]").forEach((b) => {
    b.onclick = async () => {
      const p = P.find((x) => x.id === b.dataset.edit); if (!p) return;
      const raw = await uiPrompt("แก้ไขชื่อผู้เล่น", { title: "แก้ไขชื่อ", icon: "✏️", value: p.name });
      if (raw === null) return;
      const name = raw.trim();
      if (!name || name === p.name) return;
      if (P.some((x) => x.id !== p.id && x.name.trim().toLowerCase() === name.toLowerCase())) { await uiAlert(`มีชื่อ "${name}" อยู่แล้ว`, { title: "ชื่อซ้ำ", icon: "⚠️" }); return; }
      await saveParticipants(P.map((x) => x.id === p.id ? { ...x, name } : x));
    };
  });

  // ลบผู้เล่น — ล้างคำตอบของคนนั้นด้วย แล้วเอาออกจากรายชื่อ
  document.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      const p = P.find((x) => x.id === b.dataset.del); if (!p) return;
      const ok = await uiConfirm(`เอา "${p.name}" ออกจากเกม และคำตอบของเขาจะถูกล้างไปด้วย`,
        { title: "ลบผู้เล่น?", icon: "🗑️", okText: "ลบเลย", danger: true });
      if (!ok) return;
      resetPerson(p.id);
      await saveParticipants(P.filter((x) => x.id !== p.id));
    };
  });

  // ล้างคำตอบรายคน
  document.querySelectorAll("[data-reset]").forEach((b) => {
    b.onclick = async () => { const p = P.find((x) => x.id === b.dataset.reset);
      const ok = await uiConfirm(`ล้างคำตอบ (เฉลย + คำทาย) ของ "${p?p.name:""}"`,
        { title: "ล้างคำตอบ?", icon: "🧹", okText: "ล้างเลย", danger: true });
      if (ok) resetPerson(b.dataset.reset); };
  });
  // รีเซ็ตรหัสผ่านรายคน
  document.querySelectorAll("[data-resetpin]").forEach((b) => {
    b.onclick = async () => { const p = P.find((x) => x.id === b.dataset.resetpin);
      const ok = await uiConfirm(`รีเซ็ตรหัสผ่านของ "${p?p.name:""}" — เขาจะต้องตั้งรหัส 4 หลักใหม่อีกครั้ง`,
        { title: "รีเซ็ตรหัสผ่าน?", icon: "🔑", okText: "รีเซ็ต" });
      if (ok) resetPlayer(b.dataset.resetpin); };
  });
}

// ข้อความต่อท้ายสถานะ "เปิดรับคำตอบ" เพื่อบอกเวลาปิด
function deadlineNote() {
  if (!state.deadline) return "";
  const d = fmtDeadline(state.deadline);
  return Date.now() >= state.deadline ? ` — ⛔ หมดเวลาแล้ว (${d})` : ` จนถึง ${d}`;
}

/* ---- 3. ตั้งค่าการทายผล (วันเวลาปิดทาย + ปุ่มคำนวณคะแนน) ---- */
/* ---- ป๊อปอัปผลการตอบของผู้เล่นคนหนึ่ง (ไว้ตรวจสอบ/เป็นหลักฐาน) ---- */
function showAnswers(pid) {
  const P = state.participants || [];
  const p = P.find((x) => x.id === pid); if (!p) return;
  const myTruth = truth[pid] ? truth[pid].drew : null;
  const g = guesses.find((x) => x.id === pid);
  const picks = (g && g.picks) || {};
  // ทายให้ทุกคน ยกเว้นตัวเองและ Admin (ตรงกับรายชื่อที่ผู้เล่นทายได้จริง)
  const targets = P.filter((op) => op.id !== pid && op.name.trim().toLowerCase() !== "admin");

  const rows = targets.map((op) => {
    const pick = picks[op.id];
    const real = truth[op.id] ? truth[op.id].drew : null;
    const mark = !pick ? `<span class="tag no">—</span>`
      : real ? (pick === real ? `<span class="tag yes">✓ ตรง</span>` : `<span class="tag no">✗ ไม่ตรง</span>`) : "";
    const picked = pick ? esc(nameOf(P, pick)) : `<span class="muted">— ไม่ได้ทาย —</span>`;
    return `<tr><td>${esc(op.name)}</td><td>${picked}</td><td>${mark}</td></tr>`;
  }).join("");

  const bd = document.createElement("div");
  bd.className = "modal-backdrop";
  bd.innerHTML = `
    <div class="modal-card" style="max-width:560px">
      <div class="modal-ic">📋</div>
      <h3 class="modal-title">ผลการตอบ — ${esc(p.name)}</h3>
      <div style="text-align:left;margin-top:8px">
        <p class="sub" style="margin:0 0 12px">🤫 เฉลยลับ (จับได้จริง): <b>${myTruth ? esc(nameOf(P, myTruth)) : `<span class="muted">ยังไม่กรอก</span>`}</b></p>
        <p class="sub" style="margin:0 0 6px">🎯 ทายว่าคนอื่นจับได้ใคร:</p>
        ${targets.length
          ? `<table><thead><tr><th>ทายให้</th><th>ทายว่าจับได้</th><th>ตรวจ</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<p class="muted">ไม่มีข้อมูล</p>`}
      </div>
      <div class="modal-actions"><button class="btn" id="mClose">ปิด</button></div>
    </div>`;
  document.body.appendChild(bd);
  requestAnimationFrame(() => bd.classList.add("show"));
  const close = () => { bd.classList.remove("show"); setTimeout(() => bd.remove(), 180); };
  bd.querySelector("#mClose").onclick = close;
  bd.onclick = (e) => { if (e.target === bd) close(); };
}

function sectionSettings() {
  const has = !!state.deadline;
  const passed = has && Date.now() >= state.deadline;
  const fmt = has ? fmtDeadline(state.deadline) : "";
  const dlStatus = !has
    ? "ยังไม่กำหนด — ผู้เล่นทายได้จนกว่าจะกดเฉลย"
    : passed
      ? `⛔ หมดเวลาทายแล้ว (ปิดเมื่อ ${fmt}) — ผู้เล่นทายไม่ได้แล้ว`
      : `⏰ จะปิดรับคำตอบ: ${fmt}`;

  let reveal;
  if (state.phase === "revealed")
    reveal = `<div class="good">🏆 คำนวณคะแนนแล้ว — ผลแสดงให้ทุกคนเห็น</div>`;
  else if (state.phase === "setup")
    reveal = `<button class="btn big warn" id="toReveal" disabled>🏆 เฉลย &amp; คำนวณคะแนน</button>
              <p class="muted center">เปิดให้ทายก่อน จึงจะคำนวณคะแนนได้</p>`;
  else
    reveal = `<button class="btn big warn" id="toReveal">🏆 เฉลย &amp; คำนวณคะแนน</button>`;

  const tOpen = !!state.truthOpen;
  const truthCtrl = state.phase === "revealed" ? "" : `
    <label>📝 การกรอก "เฉลยลับ" ของผู้เล่น (ส่วนที่ 1)</label>
    <p class="${tOpen ? "good" : "muted"}" style="margin:6px 0 10px">${tOpen
      ? '🔓 เปิดให้กรอกแล้ว — ผู้เล่นเลือก "ฉันจับได้" ได้'
      : "🔒 ยังล็อกอยู่ — ผู้เล่นกรอกเฉลยลับไม่ได้ (ยังทายคนอื่นได้ตามปกติ)"}</p>
    <button class="btn${tOpen ? " ghost" : ""}" id="toggleTruth">${tOpen ? "🔒 ปิดการกรอกเฉลยลับ" : "🔓 เปิดให้กรอกเฉลยลับ"}</button>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">`;

  return `<div class="card"><h2>⚙️ ตั้งค่าการทายผล</h2>
    <p class="sub">เปิด/ปิดการกรอกเฉลยลับ · กำหนดเวลาปิดรับคำตอบ แล้วกดคำนวณคะแนนเมื่อพร้อม</p>
    ${truthCtrl}
    <label>⏰ วันเวลาปิดรับคำตอบ</label>
    <input type="datetime-local" id="deadline" value="${has ? msToLocalInput(state.deadline) : ""}">
    <div class="row" style="margin-top:10px">
      <button class="btn" id="saveDeadline">บันทึกเวลาปิด</button>
      <button class="btn ghost" id="clearDeadline">ล้างเวลาปิด</button>
      <span class="muted" id="dlMsg"></span>
    </div>
    <p class="${passed ? "note" : "muted"}" style="margin-top:12px">${dlStatus}</p>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
    ${reveal}
  </div>`;
}
function wireSettings() {
  const save = document.getElementById("saveDeadline");
  if (save) save.onclick = async () => {
    const v = document.getElementById("deadline").value;
    const msg = document.getElementById("dlMsg");
    if (!v) { msg.textContent = "กรุณาเลือกวันเวลา"; return; }
    save.disabled = true;
    await setDeadline(new Date(v).getTime());
    save.disabled = false;
    msg.textContent = "บันทึกแล้ว ✓";
  };
  const clr = document.getElementById("clearDeadline");
  if (clr) clr.onclick = async () => {
    const ok = await uiConfirm("ผู้เล่นจะทายได้จนกว่าจะกดเฉลย", { title: "ล้างเวลาปิดรับคำตอบ?", icon: "⏰", okText: "ล้าง" });
    if (ok) await setDeadline(null);
  };
  const tt = document.getElementById("toggleTruth");
  if (tt) tt.onclick = async () => {
    if (!state.truthOpen) { await setTruthOpen(true); return; }
    const ok = await uiConfirm("ผู้เล่นจะกรอก/แก้เฉลยลับไม่ได้ จนกว่าจะเปิดอีกครั้ง (คำตอบที่กรอกไว้แล้วยังอยู่)",
      { title: "ปิดการกรอกเฉลยลับ?", icon: "🔒", okText: "ปิด" });
    if (ok) await setTruthOpen(false);
  };
  const r = document.getElementById("toReveal");
  if (r) r.onclick = async () => {
    const ok = await uiConfirm("ทุกคนจะเห็นผลคะแนนทันที และเปลี่ยนกลับยากขึ้น", { title: "เฉลย & คำนวณคะแนนเลยไหม?", icon: "🏆", okText: "เฉลยเลย", danger: true });
    if (ok) setPhase("revealed");
  };
}

// แปลง epoch ms → ค่าใส่ช่อง datetime-local ("YYYY-MM-DDTHH:mm" ตามเวลาเครื่อง)
function msToLocalInput(ms) {
  const d = new Date(ms), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDeadline(ms) {
  return new Date(ms).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

/* ---- ผล (หลังเฉลย) ---- */
function sectionResults(P) {
  // ไม่นับ "Admin" (ผู้คุมเกม) ในกระดานคะแนน ให้ตรงกับหน้าผู้เล่น/จอใหญ่
  const scores = computeScores(P.filter((p) => p.name.trim().toLowerCase() !== "admin"), truth, guesses);
  const lb = scores.map((s) => {
    const medal = s.rank===1?"🥇":s.rank===2?"🥈":s.rank===3?"🥉":s.rank;
    return `<tr><td style="font-weight:700">${medal}</td><td>${esc(s.name)}</td>
      <td style="font-weight:700;color:var(--blue)">${s.correct}</td><td class="muted">ทาย ${s.answered}</td></tr>`;
  }).join("");
  return `<div class="card"><h2>4 · อันดับคะแนน</h2>
    <p class="sub">เปิด <a href="board.html" target="_blank">หน้าจอใหญ่ ↗</a> ไว้ฉายตอนประกาศผล</p>
    <table><thead><tr><th>อันดับ</th><th>ชื่อ</th><th>ถูก</th><th></th></tr></thead><tbody>${lb}</tbody></table></div>`;
}

function esc(s){ return String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
