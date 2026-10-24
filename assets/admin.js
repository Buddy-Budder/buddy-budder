import { ADMIN_PIN, EVENT_NAME } from "./firebase-config.js";
import {
  ensureState, watchState, watchTruth, watchGuesses,
  saveParticipants, setPhase, resetPerson, resetAll,
  getTruthOnce, getGuessesOnce, computeScores, nameOf,
} from "./db.js";

const app = document.getElementById("app");
const phaseTag = document.getElementById("phaseTag");

let state = null, truth = {}, guesses = [];
const PHASE_TH = { setup: "ตั้งค่า 🔧", open: "เปิดให้ทาย 🟢", revealed: "เฉลยแล้ว 🏆" };

/* ---- PIN gate ---- */
if (sessionStorage.getItem("bb_admin") !== "1") { gate(); }
else { start(); }

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
}

function render() {
  if (!state) return;
  phaseTag.textContent = PHASE_TH[state.phase] || state.phase;
  const P = state.participants || [];
  const tCount = Object.keys(truth).length;
  const gCount = guesses.length;

  app.innerHTML = `
    ${sectionSetup(P)}
    ${sectionPhase(P, tCount, gCount)}
    ${P.length ? sectionProgress(P) : ""}
    ${state.phase === "revealed" ? sectionResults(P) : ""}
    ${sectionDanger()}`;

  wireSetup(P);
  wirePhase(P);
  wireProgress(P);
  wireDanger(P);
}

/* ---- 1. รายชื่อ ---- */
function sectionSetup(P) {
  const txt = P.map((p) => p.name).join("\n");
  return `<div class="card">
    <h2>1 · รายชื่อผู้เล่น (${P.length} คน)</h2>
    <p class="sub">พิมพ์ชื่อ 1 คนต่อ 1 บรรทัด แล้วกดบันทึก</p>
    <textarea id="names" placeholder="สมชาย&#10;สมหญิง&#10;…">${esc(txt)}</textarea>
    <div id="setErr"></div><div style="height:10px"></div>
    <button class="btn" id="saveNames">บันทึกรายชื่อ</button>
    <span class="muted" id="setMsg" style="margin-left:10px"></span>
  </div>`;
}
function wireSetup(P) {
  const b = document.getElementById("saveNames"); if (!b) return;
  b.onclick = async () => {
    const lines = document.getElementById("names").value.split("\n").map((s)=>s.trim()).filter(Boolean);
    if (!lines.length) return;
    // คงไอดีเดิมของชื่อที่มีอยู่แล้ว
    const byName = {}; P.forEach((p)=>byName[p.name]=p.id);
    const seen = {};
    const list = lines.map((name) => {
      let id = byName[name];
      if (!id || seen[id]) id = "p" + Math.random().toString(36).slice(2,8);
      seen[id] = 1; return { id, name };
    });
    b.disabled = true;
    await saveParticipants(list);
    b.disabled = false;
    document.getElementById("setMsg").textContent = "บันทึกแล้ว ✓";
  };
}

/* ---- 2. สถานะเกม ---- */
function sectionPhase(P, t, g) {
  const n = P.length;
  let ctrl = "";
  if (state.phase === "setup")
    ctrl = `<button class="btn big" id="toOpen" ${n<2?"disabled":""}>🟢 เปิดให้ทุกคนทายผล</button>
            ${n<2?"<p class='muted center'>ต้องมีผู้เล่นอย่างน้อย 2 คน</p>":""}`;
  else if (state.phase === "open")
    ctrl = `<div class="note">กำลังเปิดรับคำตอบ — เมื่อครบแล้วกดปุ่มด้านล่างเพื่อเฉลย</div><div style="height:12px"></div>
            <button class="btn big warn" id="toReveal">🏆 เฉลย &amp; คำนวณคะแนน</button>`;
  else
    ctrl = `<div class="good">เฉลยแล้ว — ผลคะแนนแสดงให้ทุกคนเห็น</div><div style="height:12px"></div>
            <button class="btn ghost" id="toOpen">↩︎ กลับไปเปิดรับคำตอบอีกครั้ง</button>`;
  return `<div class="card"><h2>2 · สถานะเกม</h2>
    <div class="stats" style="margin-bottom:14px">
      <div class="stat"><b>${n}</b><span>ผู้เล่น</span></div>
      <div class="stat"><b>${t}</b><span>กรอกเฉลยแล้ว</span></div>
      <div class="stat"><b>${g}</b><span>ทายแล้ว</span></div>
    </div>${ctrl}</div>`;
}
function wirePhase(P) {
  const o = document.getElementById("toOpen"); if (o) o.onclick = () => setPhase("open");
  const r = document.getElementById("toReveal");
  if (r) r.onclick = () => { if (confirm("เฉลยและคำนวณคะแนนเลยไหม? ทุกคนจะเห็นผลทันที")) setPhase("revealed"); };
}

/* ---- 3. ความคืบหน้า ---- */
function sectionProgress(P) {
  const rows = P.map((p) => {
    const t = truth[p.id] ? `<span class="tag yes">✓</span>` : `<span class="tag no">ยัง</span>`;
    const g = guesses.some((x)=>x.id===p.id) ? `<span class="tag yes">✓</span>` : `<span class="tag no">ยัง</span>`;
    return `<tr><td>${esc(p.name)}</td><td>${t}</td><td>${g}</td>
      <td><button class="btn ghost" data-reset="${p.id}" style="padding:5px 10px;font-size:.82rem">ล้าง</button></td></tr>`;
  }).join("");
  return `<div class="card"><h2>3 · ความคืบหน้า (อัปเดตสด)</h2>
    <table><thead><tr><th>ชื่อ</th><th>เฉลย</th><th>ทาย</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function wireProgress(P) {
  document.querySelectorAll("[data-reset]").forEach((b) => {
    b.onclick = () => { const p = P.find((x)=>x.id===b.dataset.reset);
      if (confirm(`ล้างคำตอบของ ${p?p.name:""}?`)) resetPerson(b.dataset.reset); };
  });
}

/* ---- 4. ผล (หลังเฉลย) ---- */
function sectionResults(P) {
  const scores = computeScores(P, truth, guesses);
  const lb = scores.map((s) => {
    const medal = s.rank===1?"🥇":s.rank===2?"🥈":s.rank===3?"🥉":s.rank;
    return `<tr><td style="font-weight:700">${medal}</td><td>${esc(s.name)}</td>
      <td style="font-weight:700;color:var(--blue)">${s.correct}</td><td class="muted">ทาย ${s.answered}</td></tr>`;
  }).join("");
  return `<div class="card"><h2>4 · อันดับคะแนน</h2>
    <p class="sub">เปิด <a href="board.html" target="_blank">หน้าจอใหญ่ ↗</a> ไว้ฉายตอนประกาศผล</p>
    <table><thead><tr><th>อันดับ</th><th>ชื่อ</th><th>ถูก</th><th></th></tr></thead><tbody>${lb}</tbody></table></div>`;
}

/* ---- 5. โซนอันตราย ---- */
function sectionDanger() {
  return `<div class="card" style="border-color:#fbd0d0">
    <h2 style="color:#dc2626">⚠️ รีเซ็ตเกม</h2>
    <p class="sub">ลบคำตอบทั้งหมดและกลับไปสถานะตั้งค่า (เก็บรายชื่อไว้)</p>
    <button class="btn warn" id="resetAll">ล้างคำตอบทั้งหมด</button>
    <button class="btn ghost" id="logout" style="margin-left:8px">ออกจากระบบ</button>
  </div>`;
}
function wireDanger(P) {
  document.getElementById("resetAll").onclick = () => {
    if (confirm("ลบคำตอบทั้งหมดจริงหรือ? (รายชื่อยังอยู่)")) resetAll(P);
  };
  document.getElementById("logout").onclick = () => { sessionStorage.removeItem("bb_admin"); location.reload(); };
}

function esc(s){ return String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
