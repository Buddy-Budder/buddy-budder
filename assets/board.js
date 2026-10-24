import { EVENT_NAME } from "./firebase-config.js";
import { watchState, watchTruth, watchGuesses, computeScores } from "./db.js";

const app = document.getElementById("app");
let state = null, truth = {}, guesses = [];

// ชื่อ "Admin" เป็นผู้คุมเกม ไม่ใช่ผู้เล่น → ไม่นับ/ไม่โชว์ในกระดาน
const isAdmin = (p) => p && p.name.trim().toLowerCase() === "admin";
const players = () => (state?.participants || []).filter((p) => !isAdmin(p));

watchState((s) => { state = s; render(); });
watchTruth((m) => { truth = m; render(); });
watchGuesses((a) => { guesses = a; render(); });

function render() {
  if (!state) return;
  if (state.phase !== "revealed") {
    const t = Object.keys(truth).length, g = guesses.length, n = players().length;
    app.innerHTML = `
      <div style="text-align:center;padding-top:60px">
        <img src="assets/logo_white.png" style="height:70px;margin-bottom:20px">
        <h1>${esc(EVENT_NAME)}</h1>
        <p style="font-size:1.3rem;opacity:.85">รอประกาศผล…</p>
        <div class="stats" style="max-width:560px;margin:30px auto 0">
          <div class="stat" style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25);color:#fff">
            <b style="color:#fff">${n}</b><span style="color:#dce9ff">ผู้เล่น</span></div>
          <div class="stat" style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25);color:#fff">
            <b style="color:#fff">${g}</b><span style="color:#dce9ff">ทายแล้ว</span></div>
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
      <img src="assets/logo_white.png" style="height:56px;margin:10px 0">
      <h1>🏆 อันดับคะแนน</h1>
    </div>
    ${lb || "<p style='text-align:center'>ยังไม่มีผู้ทาย</p>"}`;
}
function esc(s){ return String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
