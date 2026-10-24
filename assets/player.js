import { EVENT_NAME } from "./firebase-config.js";
import {
  watchState, submitTruth, submitGuess, getTruthOnce, getGuessesOnce,
  computeScores, nameOf,
} from "./db.js";
import { enhancePickers } from "./picker.js";
import { uiAlert } from "./ui.js";

const app = document.getElementById("app");
document.getElementById("evtName").textContent = EVENT_NAME;
document.title = EVENT_NAME + " — ทายผล";

const ME_KEY = "bb_me";
const AUTH_KEY = "bb_auth";

// ยามเฝ้าประตู — ยังไม่ได้ล็อกอิน → ส่งกลับหน้าเข้าสู่ระบบ · เป็นผู้ดูแล → ส่งไปหน้าผู้ดูแล
if (localStorage.getItem(AUTH_KEY) !== "1" || !localStorage.getItem(ME_KEY)) {
  location.replace("index.html");
} else if (localStorage.getItem("bb_role") === "admin") {
  location.replace("admin.html");
}

let state = null;        // { participants, phase }
let me = localStorage.getItem(ME_KEY) || null;

// ชื่อ "Admin" เป็นผู้คุมเกม ไม่ใช่ผู้เล่น → ไม่ให้โผล่ในเกม (เลือกชื่อ/ทาย/คะแนน/เฉลย)
const isAdmin = (p) => p && p.name.trim().toLowerCase() === "admin";
const players = () => (state?.participants || []).filter((p) => !isAdmin(p));

// วันเวลาปิดรับคำตอบ (epoch ms ใน state.deadline) — เลยเวลาแล้วผู้เล่นทายไม่ได้
const deadlinePassed = () => !!(state && state.deadline) && Date.now() >= state.deadline;
const fmtDeadline = (ms) => new Date(ms).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
let deadlineTimer = null;
// พอถึงเวลาปิด ให้หน้ารีเฟรชเองเพื่อสลับไปจอ "หมดเวลา" (watchState ไม่ยิงตามเวลา)
function scheduleDeadline() {
  if (deadlineTimer) { clearTimeout(deadlineTimer); deadlineTimer = null; }
  if (state && state.deadline && Date.now() < state.deadline)
    deadlineTimer = setTimeout(render, state.deadline - Date.now() + 500);
}
function deadlineBanner() {
  if (!state.deadline) return "";
  return `<div class="note center" style="margin-bottom:12px">⏰ ปิดรับคำตอบ: ${esc(fmtDeadline(state.deadline))}</div>`;
}

function meValid() {
  return me && state && state.participants.some((p) => p.id === me);
}
function setMe(id) { me = id; localStorage.setItem(ME_KEY, id); render(); }
// ออกจากระบบ (ใช้ตอน "ให้คนถัดไป" / ยกเลิก / ถูกลบชื่อ) → กลับไปหน้าล็อกอิน
function clearMe() { localStorage.removeItem(ME_KEY); localStorage.removeItem(AUTH_KEY); location.href = "index.html"; }

watchState((s) => {
  state = s;
  if (me && s && !s.participants.some((p) => p.id === me)) clearMe();
  render();
});

// ชื่อผู้ใช้แสดงที่ท้าย sidebar — โชว์เมื่อเลือกชื่อแล้ว ซ่อนเมื่อยังไม่เลือก
function meTag() {
  const name = meValid() ? nameOf(state.participants, me) : "";
  document.getElementById("meTag").textContent = name;
  document.getElementById("sideUser").style.display = name ? "flex" : "none";
}

// ปุ่มออกจากระบบท้าย sidebar — ผูกครั้งเดียว (อยู่นอก #app จึงไม่ถูก render ทับ)
document.getElementById("logout").onclick = clearMe;

async function render() {
  meTag();
  if (!state) { app.innerHTML = card("กำลังเชื่อมต่อฐานข้อมูล…"); return; }

  if (state.phase === "setup") {
    app.innerHTML = card("ยังไม่เปิดให้ทายผล 🔒",
      "<p class='muted'>รอผู้ดูแลเปิดเกมก่อนนะครับ แล้วค่อยเข้ามาเลือกชื่อและทายผล</p>");
    return;
  }
  if (state.phase === "revealed") { return renderResults(); }

  // phase === "open"
  scheduleDeadline();
  if (deadlinePassed()) return renderClosed();
  if (!meValid()) return renderPickName();
  return renderPlay();
}

/* ---------- ปิดรับคำตอบแล้ว (เลยเวลาปิดทาย) ---------- */
function renderClosed() {
  app.innerHTML = card("⏰ หมดเวลาทายแล้ว",
    `<p class="muted">ปิดรับคำตอบเมื่อ ${esc(fmtDeadline(state.deadline))}<br>รอผู้ดูแลประกาศผลนะครับ 🏆</p>`);
}

/* ---------- เลือกชื่อตัวเอง ---------- */
function renderPickName() {
  const opts = players()
    .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  app.innerHTML = `
    ${deadlineBanner()}
    <div class="card">
      <h2>เลือกชื่อของคุณ</h2>
      <p class="sub">เลือกชื่อตัวเองเพื่อเริ่มกรอกและทายผล</p>
      <label>คุณคือ…</label>
      <select id="who" class="pick"><option value="">— เลือกชื่อ —</option>${opts}</select>
      <div style="height:14px"></div>
      <button class="btn big" id="go" disabled>เริ่ม</button>
    </div>`;
  enhancePickers(app);
  const sel = document.getElementById("who"), go = document.getElementById("go");
  sel.onchange = () => (go.disabled = !sel.value);
  go.onclick = () => sel.value && setMe(sel.value);
}

/* ---------- กรอกเฉลยลับ + ทาย ---------- */
async function renderPlay() {
  const myName = nameOf(state.participants, me);
  const truthOpen = !!state.truthOpen;   // ส่วนที่ 1 (เฉลยลับ) กรอกได้เมื่อผู้ดูแลเปิดเท่านั้น
  // ดึงคำตอบเดิม (ถ้าเคยส่ง)
  const [truth, guesses] = await Promise.all([getTruthOnce(), getGuessesOnce()]);
  const myTruth = truth[me] || null;
  const myGuess = guesses.find((g) => g.id === me) || null;
  const done = myTruth && myGuess;

  if (done && !renderPlay._edit) {
    app.innerHTML = `
      <div class="card center">
        <h2>ส่งคำตอบเรียบร้อยแล้ว ✅</h2>
        <p class="sub">${esc(myName)} — คำตอบถูกเก็บไว้ จะเฉลยในวันกิจกรรมจบ</p>
        <div class="note">ไม่มีเฉลยตอนนี้นะครับ 🤫</div>
        <div style="height:16px"></div>
        <div class="row" style="justify-content:center">
          <button class="btn ghost" id="edit">แก้ไขคำตอบ</button>
          <button class="btn" id="next">เสร็จแล้ว — ให้คนถัดไป</button>
        </div>
      </div>`;
    document.getElementById("edit").onclick = () => { renderPlay._edit = true; renderPlay(); };
    document.getElementById("next").onclick = clearMe;
    return;
  }

  const others = players().filter((p) => p.id !== me);
  const truthOpts = (selId) => `<option value="">— เลือก —</option>` +
    others.map((p) => `<option value="${p.id}" ${selId===p.id?"selected":""}>${esc(p.name)}</option>`).join("");
  const guessOpts = (forId, selId) => `<option value="">— ยังไม่ทาย —</option>` +
    players().filter((p) => p.id !== forId)
      .map((p) => `<option value="${p.id}" ${selId===p.id?"selected":""}>${esc(p.name)}</option>`).join("");

  const rows = others.map((p) => {
    const sel = myGuess && myGuess.picks ? myGuess.picks[p.id] : "";
    return `<div class="guess-row">
      <div class="who">${esc(p.name)}</div>
      <div class="guess-arrow">จับได้ →</div>
      <select data-g="${p.id}" class="pick">${guessOpts(p.id, sel)}</select>
    </div>`;
  }).join("");

  app.innerHTML = `
    <div class="card">
      <h2>ส่วนที่ 1 · เฉลยลับของคุณ 🤫</h2>
      ${truthOpen
        ? `<p class="sub">คุณคือ <b>${esc(myName)}</b> — คุณจับสลากได้ชื่อใคร? (ไม่มีใครเห็น ใช้เป็นเฉลยตอนจบ)</p>
           <label>ฉันจับได้ →</label>
           <select id="mytruth" class="pick">${truthOpts(myTruth ? myTruth.drew : "")}</select>`
        : `<div class="note">🔒 รอผู้ดูแลเปิดให้กรอกเฉลยลับก่อนนะครับ<br>ระหว่างนี้ทายคนอื่นในส่วนที่ 2 ได้เลย แล้วกด "ส่งคำตอบ" เพื่อบันทึก</div>`}
    </div>

    <div class="card">
      <h2>ส่วนที่ 2 · ทายว่าคนอื่นจับได้ใคร 🎯</h2>
      <p class="sub">ทายให้ครบทุกคนเพื่อลุ้นคะแนนสูงสุด (ข้ามได้ถ้าไม่แน่ใจ)</p>
      ${state.deadline ? `<div class="note center" style="margin:0 0 14px">⏰ เฉพาะส่วนนี้ปิดรับคำตอบ: ${esc(fmtDeadline(state.deadline))}</div>` : ""}
      ${rows}
    </div>

    <div id="msg"></div>
    <button class="btn big" id="save">ส่งคำตอบ</button>`;

  enhancePickers(app);
  // กันทายซ้ำ: ชื่อที่เลือกในช่องหนึ่งแล้ว จะถูกปิด (จาง + "เลือกไปแล้ว") ในช่องอื่น
  // (แต่ละคนจับได้คนละคนไม่ซ้ำกัน การทายซ้ำจึงผิดแน่นอน)
  const refreshGuessAvail = () => {
    const sels = Array.from(document.querySelectorAll("select[data-g]"));
    const taken = new Set(sels.map((s) => s.value).filter(Boolean));
    sels.forEach((s) => {
      Array.from(s.options).forEach((o) => {
        o.disabled = !!o.value && o.value !== s.value && taken.has(o.value);
      });
    });
  };
  refreshGuessAvail();
  document.querySelectorAll("select[data-g]").forEach((s) => s.addEventListener("change", refreshGuessAvail));
  document.getElementById("save").onclick = async () => {
    if (deadlinePassed()) { render(); return; }
    // เฉลยลับกรอกได้เมื่อผู้ดูแลเปิดเท่านั้น — ถ้ายังล็อก ให้บันทึกเฉพาะคำทาย
    const drew = truthOpen ? document.getElementById("mytruth").value : "";
    if (truthOpen && !drew) { msg("กรุณาเลือกว่าคุณจับได้ใครก่อน (ส่วนที่ 1)", "warn"); return; }
    const picks = {};
    document.querySelectorAll("select[data-g]").forEach((s) => { if (s.value) picks[s.dataset.g] = s.value; });
    const btn = document.getElementById("save"); btn.disabled = true; btn.textContent = "กำลังบันทึก…";
    try {
      if (truthOpen && drew) await submitTruth(me, myName, drew);
      await submitGuess(me, myName, picks);
      renderPlay._edit = false;
      // ป๊อปอัปแจ้งว่าบันทึกสำเร็จ (ยังล็อกเฉลยลับ = บันทึกเฉพาะคำทายไว้ก่อน)
      await uiAlert(
        truthOpen
          ? "คำตอบของคุณถูกเก็บไว้เรียบร้อย จะเฉลยในวันกิจกรรมจบ"
          : "บันทึกคำทายแล้ว รอผู้ดูแลเปิดให้กรอกเฉลยลับ สามารถกลับมาแก้ไขได้จนกว่าจะปิดรับคำตอบ",
        { title: "บันทึกสำเร็จแล้ว ✅", icon: "🎉" }
      );
      renderPlay();
    } catch (e) {
      msg("บันทึกไม่สำเร็จ: " + e.message, "warn"); btn.disabled = false; btn.textContent = "ส่งคำตอบ";
    }
  };
}

/* ---------- หน้าเฉลย ---------- */
async function renderResults() {
  const [truth, guesses] = await Promise.all([getTruthOnce(), getGuessesOnce()]);
  const scores = computeScores(players(), truth, guesses);
  const myScore = meValid() ? scores.find((s) => s.id === me) : null;

  let mine = "";
  if (myScore) {
    const total = players().length - 1;
    mine = `<div class="card center">
      <h2>คะแนนของคุณ</h2>
      <div style="font-size:3rem;font-weight:800;color:var(--blue)">${myScore.correct}<span style="font-size:1.2rem;color:var(--muted)">/${total}</span></div>
      <p class="sub">อันดับที่ ${myScore.rank} จาก ${scores.length} คน</p>
    </div>`;
  }

  const lb = scores.map((s) => {
    const cls = s.rank===1?"top1":s.rank===2?"top2":s.rank===3?"top3":"";
    const medal = s.rank===1?"🥇":s.rank===2?"🥈":s.rank===3?"🥉":s.rank;
    return `<div class="lb-row ${cls}"><div class="rk">${medal}</div>
      <div class="nm">${esc(s.name)}${s.id===me?" (คุณ)":""}</div>
      <div class="sc">${s.correct}</div></div>`;
  }).join("");

  const answers = players().map((p) =>
    `<tr><td>${esc(p.name)}</td><td>→ ${esc(nameOf(state.participants, truth[p.id]?truth[p.id].drew:null))}</td></tr>`
  ).join("");

  app.innerHTML = `
    ${mine}
    <div class="card"><h2>🏆 อันดับคะแนน</h2>${lb || "<p class='muted'>ยังไม่มีผู้ทาย</p>"}</div>
    <div class="card"><h2>เฉลย — ใครจับได้ใคร</h2>
      <table><thead><tr><th>คน</th><th>จับได้</th></tr></thead><tbody>${answers}</tbody></table></div>`;
}

/* ---------- utils ---------- */
function card(title, body="") { return `<div class="card center"><h2>${title}</h2>${body}</div>`; }
function msg(t, kind) { document.getElementById("msg").innerHTML = `<div class="${kind==='warn'?'note':'good'}">${esc(t)}</div>`; }
function esc(s){ return String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
