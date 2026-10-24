import { EVENT_NAME } from "./firebase-config.js";
import { watchState, watchTruth, watchGuesses, computeScores, nameOf } from "./db.js";
import { watchPlayers } from "./auth-db.js";

const app = document.getElementById("app");
let state = null, truth = {}, guesses = [], registered = {};
const ME = localStorage.getItem("bb_me");

// ชื่อ "Admin" เป็นผู้คุมเกม ไม่ใช่ผู้เล่น → ไม่นับ/ไม่โชว์ในกระดาน
const isAdmin = (p) => p && p.name.trim().toLowerCase() === "admin";
const players = () => (state?.participants || []).filter((p) => !isAdmin(p));

// ชื่อผู้ใช้ท้าย sidebar — โชว์เมื่อล็อกอินอยู่ ซ่อนเมื่อเปิดดูแบบไม่ล็อกอิน (เช่น จอโปรเจกเตอร์)
function userTag() {
  const inGame = ME && state && state.participants.some((p) => p.id === ME);
  document.getElementById("meTag").textContent = inGame ? nameOf(state.participants, ME) : "";
  document.getElementById("sideUser").style.display = inGame ? "flex" : "none";
}

// ปุ่มออกจากระบบท้าย sidebar — ผูกครั้งเดียว (อยู่นอก #app จึงไม่ถูก render ทับ)
document.getElementById("logout").onclick = () => {
  localStorage.removeItem("bb_me");
  localStorage.removeItem("bb_auth");
  localStorage.removeItem("bb_role");
  sessionStorage.removeItem("bb_admin");
  location.href = "index.html";
};

watchState((s) => { state = s; render(); });
watchTruth((m) => { truth = m; render(); });
watchGuesses((a) => { guesses = a; render(); });
watchPlayers((ids) => { registered = ids; render(); });

function render() {
  userTag();
  if (!state) return;
  if (state.phase !== "revealed") {
    // ผู้เล่น = นับเฉพาะคนที่ "ลงทะเบียนแล้ว" (มีรหัสผ่านใน players/) ไม่ใช่แค่รายชื่อที่แอดมินเพิ่ม
    const n = players().filter((p) => registered[p.id]).length;
    // ทายแล้ว = นับเฉพาะคนที่ "ทายครบทุกคู่" (ทายคนอื่นครบทุกคน) ไม่ใช่แค่กดบันทึก
    const g = guesses.filter((gu) => {
      const others = players().filter((p) => p.id !== gu.id);
      return others.length > 0 && others.every((p) => gu.picks && gu.picks[p.id]);
    }).length;
    app.innerHTML = `
      <div class="board-hero">
        <img class="hero-logo" src="assets/logo_white.png" alt="${esc(EVENT_NAME)}">
        <h1>${esc(EVENT_NAME)}</h1>
        <p class="muted wait">รอประกาศผล…</p>
        <div class="stats">
          <div class="stat"><b>${n}</b><span>ผู้เล่น</span></div>
          <div class="stat"><b>${g}</b><span>ทายแล้ว</span></div>
        </div>
      </div>`;
    return;
  }
  const scores = computeScores(players(), truth, guesses);
  const lb = scores.map((s) => {
    const cls = s.rank===1?"top1":s.rank===2?"top2":s.rank===3?"top3":"";
    const medal = s.rank===1?"🥇":s.rank===2?"🥈":s.rank===3?"🥉":s.rank;
    return `<div class="lb-row ${cls}"><div class="rk">${medal}</div>
      <div class="nm">${esc(s.name)}</div><div class="sc">${s.correct}</div></div>`;
  }).join("");
  app.innerHTML = `
    <div style="text-align:center">
      <img class="board-logo-sm" src="assets/logo_white.png" alt="${esc(EVENT_NAME)}">
      <h1>🏆 อันดับคะแนน</h1>
    </div>
    ${lb || "<p style='text-align:center'>ยังไม่มีผู้ทาย</p>"}`;
}
function esc(s){ return String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
