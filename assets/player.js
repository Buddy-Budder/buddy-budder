import { EVENT_NAME } from "./firebase-config.js";
import {
  watchState, submitTruth, submitGuess, getTruthOnce, getGuessesOnce,
  computeScores, nameOf,
} from "./db.js";

const app = document.getElementById("app");
document.getElementById("evtName").textContent = EVENT_NAME;
document.title = EVENT_NAME + " — ทายผล";

const ME_KEY = "bb_me";
let state = null;        // { participants, phase }
let me = localStorage.getItem(ME_KEY) || null;

function meValid() {
  return me && state && state.participants.some((p) => p.id === me);
}
function setMe(id) { me = id; localStorage.setItem(ME_KEY, id); render(); }
function clearMe() { me = null; localStorage.removeItem(ME_KEY); render(); }

watchState((s) => {
  state = s;
  if (me && s && !s.participants.some((p) => p.id === me)) clearMe();
  render();
});

function meTag() {
  const el = document.getElementById("meTag");
  el.textContent = meValid() ? "👤 " + nameOf(state.participants, me) : "";
}

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
  if (!meValid()) return renderPickName();
  return renderPlay();
}

/* ---------- เลือกชื่อตัวเอง ---------- */
function renderPickName() {
  const opts = state.participants
    .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  app.innerHTML = `
    <div class="card">
      <h2>เลือกชื่อของคุณ</h2>
      <p class="sub">เลือกชื่อตัวเองเพื่อเริ่มกรอกและทายผล</p>
      <label>คุณคือ…</label>
      <select id="who"><option value="">— เลือกชื่อ —</option>${opts}</select>
      <div style="height:14px"></div>
      <button class="btn big" id="go" disabled>เริ่ม</button>
    </div>`;
  const sel = document.getElementById("who"), go = document.getElementById("go");
  sel.onchange = () => (go.disabled = !sel.value);
  go.onclick = () => sel.value && setMe(sel.value);
}

/* ---------- กรอกเฉลยลับ + ทาย ---------- */
async function renderPlay() {
  const myName = nameOf(state.participants, me);
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

  const others = state.participants.filter((p) => p.id !== me);
  const truthOpts = (selId) => `<option value="">— เลือก —</option>` +
    others.map((p) => `<option value="${p.id}" ${selId===p.id?"selected":""}>${esc(p.name)}</option>`).join("");
  const guessOpts = (forId, selId) => `<option value="">— ยังไม่ทาย —</option>` +
    state.participants.filter((p) => p.id !== forId)
      .map((p) => `<option value="${p.id}" ${selId===p.id?"selected":""}>${esc(p.name)}</option>`).join("");

  const rows = others.map((p) => {
    const sel = myGuess && myGuess.picks ? myGuess.picks[p.id] : "";
    return `<div class="guess-row">
      <div class="who">${esc(p.name)}</div>
      <select data-g="${p.id}">${guessOpts(p.id, sel)}</select>
    </div>`;
  }).join("");

  app.innerHTML = `
    <div class="card">
      <h2>ส่วนที่ 1 · เฉลยลับของคุณ 🤫</h2>
      <p class="sub">คุณคือ <b>${esc(myName)}</b> — คุณจับสลากได้ชื่อใคร? (ไม่มีใครเห็น ใช้เป็นเฉลยตอนจบ)</p>
      <label>ฉันจับได้ →</label>
      <select id="mytruth">${truthOpts(myTruth ? myTruth.drew : "")}</select>
    </div>

    <div class="card">
      <h2>ส่วนที่ 2 · ทายว่าคนอื่นจับได้ใคร 🎯</h2>
      <p class="sub">ทายให้ครบทุกคนเพื่อลุ้นคะแนนสูงสุด (ข้ามได้ถ้าไม่แน่ใจ)</p>
      ${rows}
    </div>

    <div id="msg"></div>
    <button class="btn big" id="save">ส่งคำตอบ</button>
    <p class="center muted" style="margin-top:10px">
      <a href="#" id="cancel">ยกเลิก / เปลี่ยนคน</a>
    </p>`;

  document.getElementById("cancel").onclick = (e) => { e.preventDefault(); renderPlay._edit=false; clearMe(); };
  document.getElementById("save").onclick = async () => {
    const drew = document.getElementById("mytruth").value;
    if (!drew) { msg("กรุณาเลือกว่าคุณจับได้ใครก่อน (ส่วนที่ 1)", "warn"); return; }
    const picks = {};
    document.querySelectorAll("select[data-g]").forEach((s) => { if (s.value) picks[s.dataset.g] = s.value; });
    const btn = document.getElementById("save"); btn.disabled = true; btn.textContent = "กำลังบันทึก…";
    try {
      await submitTruth(me, myName, drew);
      await submitGuess(me, myName, picks);
      renderPlay._edit = false;
      renderPlay();
    } catch (e) {
      msg("บันทึกไม่สำเร็จ: " + e.message, "warn"); btn.disabled = false; btn.textContent = "ส่งคำตอบ";
    }
  };
}

/* ---------- หน้าเฉลย ---------- */
async function renderResults() {
  const [truth, guesses] = await Promise.all([getTruthOnce(), getGuessesOnce()]);
  const scores = computeScores(state.participants, truth, guesses);
  const myScore = meValid() ? scores.find((s) => s.id === me) : null;

  let mine = "";
  if (myScore) {
    const total = state.participants.length - 1;
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

  const answers = state.participants.map((p) =>
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
