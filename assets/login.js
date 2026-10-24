// หน้าเข้าสู่ระบบ — เลือกชื่อ + รหัส 4 หลัก (ครั้งแรก = ลงทะเบียน / กลับมา = เข้าซ้ำ)
import { EVENT_NAME } from "./firebase-config.js";
import { watchState } from "./db.js";
import { registerPlayer, verifyPin, watchPlayers, isFourDigit } from "./auth-db.js";

const app = document.getElementById("app");
const ME_KEY = "bb_me";
const AUTH_KEY = "bb_auth";

// ล็อกอินค้างอยู่แล้ว → เข้าเกมเลย
if (localStorage.getItem(AUTH_KEY) === "1" && localStorage.getItem(ME_KEY)) {
  location.replace("play.html");
}

const QUOTES = [
  "ของขวัญที่ดีที่สุด คือการได้อยู่ร่วมกับคนที่เราแคร์ 🎁",
  "รอยยิ้มเล็กๆ ของวันนี้ อาจเป็นของขวัญชิ้นใหญ่ของใครบางคน 💙",
  "ความสุขจะเพิ่มขึ้นเสมอ เมื่อเราได้แบ่งปัน ✨",
  "เกมเล็กๆ ที่ทำให้พวกเราได้ยิ้มไปด้วยกัน 🎄",
];
const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

let state = null;       // { participants, phase }
let registered = {};    // { pid: true }
let gotState = false, gotPlayers = false;
let mode = "register";  // "register" | "login"
let busy = false;

watchState((s) => { state = s; gotState = true; render(); });
watchPlayers((ids) => { registered = ids; gotPlayers = true; render(); });

/* ---------- render ---------- */
function render() {
  if (!gotState || !gotPlayers) { app.innerHTML = frame(`<p class="login-quote">กำลังเชื่อมต่อ…</p>`); return; }
  const P = state.participants || [];
  const unreg = P.filter((p) => !registered[p.id]);
  const reg = P.filter((p) => registered[p.id]);

  let body;
  if (!P.length) {
    body = info("ผู้ดูแลยังไม่ได้เพิ่มรายชื่อผู้เล่น", "กลับมาใหม่อีกครั้งเมื่อผู้ดูแลเพิ่มชื่อแล้วนะครับ");
  } else if (mode === "register") {
    body = unreg.length
      ? registerForm(unreg)
      : info("ทุกคนลงทะเบียนแล้ว 🎉", "กดด้านล่างเพื่อเข้าสู่ระบบด้วยรหัสของคุณ") + switchLink();
  } else {
    body = reg.length
      ? loginForm(reg)
      : info("ยังไม่มีใครลงทะเบียน", "คุณเป็นคนแรก! กดด้านล่างเพื่อลงทะเบียน") + switchLink();
  }
  app.innerHTML = frame(body);
  wire();
}

/* ---------- ชิ้นส่วน UI ---------- */
function frame(inner) {
  return `<div class="login-bg"><div class="login-card">
    <img class="login-logo" src="assets/logo_white.png" alt="${esc(EVENT_NAME)}">
    <h1>ยินดีต้อนรับ 🎉</h1>
    <p class="login-quote">“${esc(quote)}”</p>
    ${inner}
  </div></div>`;
}

function opts(list) {
  return `<option value="">— เลือกชื่อ —</option>` +
    list.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
}

function registerForm(unreg) {
  return `
    <div class="field"><label>เลือกชื่อของคุณ</label>
      <select id="who">${opts(unreg)}</select></div>
    <div class="field"><label>ตั้งรหัสผ่าน (ตัวเลข 4 หลัก)</label>
      <input id="pin" class="pin-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></div>
    <div class="field"><label>ยืนยันรหัสผ่านอีกครั้ง</label>
      <input id="pin2" class="pin-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></div>
    <div id="err"></div>
    <button class="btn big" id="go">สร้างรหัส &amp; เข้าสู่ระบบ</button>
    <p class="login-switch">เคยลงทะเบียนแล้ว? <a id="switchMode" data-to="login">เข้าสู่ระบบด้วยรหัสผ่าน</a></p>`;
}

function loginForm(reg) {
  return `
    <div class="field"><label>เลือกชื่อของคุณ</label>
      <select id="who">${opts(reg)}</select></div>
    <div class="field"><label>รหัสผ่าน (ตัวเลข 4 หลัก)</label>
      <input id="pin" class="pin-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></div>
    <div id="err"></div>
    <button class="btn big" id="go">เข้าสู่ระบบ</button>
    <p class="login-switch">ยังไม่เคยลงทะเบียน? <a id="switchMode" data-to="register">ลงทะเบียนใหม่</a></p>`;
}

function info(title, sub) {
  return `<div class="note login-note"><b>${esc(title)}</b><br>${esc(sub)}</div>`;
}
function switchLink() {
  const to = mode === "register" ? "login" : "register";
  const txt = to === "login" ? "เข้าสู่ระบบด้วยรหัสผ่าน" : "ลงทะเบียนใหม่";
  return `<p class="login-switch"><a id="switchMode" data-to="${to}">${txt}</a></p>`;
}
function adminLink() {
  return `<p class="login-switch" style="margin-top:8px"><a id="adminMode">🔧 เข้าสู่ระบบผู้ดูแล</a></p>`;
}
function adminLabel(isReg) { return isReg ? "เข้าสู่ระบบผู้ดูแล" : "สร้างรหัสผู้ดูแล & เข้าสู่ระบบ"; }

// ฟอร์มผู้ดูแล — ชื่อ "Admin" ตายตัว (ไม่ใช่ผู้เล่นในเกม) ครั้งแรก = ตั้งรหัส / ครั้งต่อไป = ใส่รหัส
function adminForm(isReg) {
  const confirm = isReg ? "" : `
    <div class="field"><label>ยืนยันรหัสอีกครั้ง</label>
      <input id="pin2" class="pin-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></div>`;
  return `
    <div class="note login-note">🔧 สำหรับผู้ดูแลเกม (คุมการเปิด/เฉลย/รายชื่อ)</div>
    <div class="field"><label>${isReg ? "รหัสผู้ดูแล (ตัวเลข 4 หลัก)" : "ตั้งรหัสผู้ดูแล (ตัวเลข 4 หลัก)"}</label>
      <input id="pin" class="pin-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></div>
    ${confirm}
    <div id="err"></div>
    <button class="btn big" id="go">${adminLabel(isReg)}</button>
    <p class="login-switch"><a id="backPlayer">← กลับไปหน้าผู้เล่น</a></p>`;
}

/* ---------- เชื่อมปุ่ม ---------- */
function wire() {
  const sw = document.getElementById("switchMode");
  if (sw) sw.onclick = () => { mode = sw.dataset.to; render(); };
  const am = document.getElementById("adminMode");
  if (am) am.onclick = () => { mode = "admin"; render(); };
  const bp = document.getElementById("backPlayer");
  if (bp) bp.onclick = () => { mode = "register"; render(); };

  document.querySelectorAll(".pin-input").forEach((i) =>
    i.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); }));

  const go = document.getElementById("go");
  if (!go) return;
  go.onclick = () => (mode === "register" ? doRegister() : mode === "login" ? doLogin() : doAdmin());
  app.querySelectorAll("input").forEach((i) =>
    i.addEventListener("keydown", (e) => { if (e.key === "Enter") go.click(); }));
}

function doneLabel() { return mode === "register" ? "สร้างรหัส & เข้าสู่ระบบ" : "เข้าสู่ระบบ"; }
function setBtn(t, dis) { const b = document.getElementById("go"); if (b) { b.textContent = t; b.disabled = !!dis; } }
function err(t) { const el = document.getElementById("err"); if (el) el.innerHTML = `<div class="note login-note">${esc(t)}</div>`; }
function finish(pid) {
  const p = (state?.participants || []).find((x) => x.id === pid);
  const isAdmin = p && p.name.trim().toLowerCase() === "admin";
  localStorage.setItem(ME_KEY, pid);
  localStorage.setItem(AUTH_KEY, "1");
  if (isAdmin) { localStorage.setItem("bb_role", "admin"); location.href = "admin.html"; }
  else { localStorage.removeItem("bb_role"); location.href = "play.html"; }
}

async function doRegister() {
  if (busy) return;
  const pid = document.getElementById("who").value;
  const pin = document.getElementById("pin").value;
  const pin2 = document.getElementById("pin2").value;
  if (!pid) return err("กรุณาเลือกชื่อของคุณก่อน");
  if (!isFourDigit(pin)) return err("รหัสผ่านต้องเป็นตัวเลข 4 หลักเท่านั้น");
  if (pin !== pin2) return err("ยืนยันรหัสผ่านไม่ตรงกัน ลองใหม่อีกครั้ง");
  busy = true; setBtn("กำลังสร้างรหัส…", true);
  try {
    if (registered[pid]) throw new Error("ชื่อนี้เพิ่งถูกลงทะเบียนไปแล้ว ใช้ปุ่มเข้าสู่ระบบแทนครับ");
    await registerPlayer(pid, pin);
    finish(pid);
  } catch (e) { busy = false; setBtn(doneLabel(), false); err("ไม่สำเร็จ: " + e.message); }
}

async function doLogin() {
  if (busy) return;
  const pid = document.getElementById("who").value;
  const pin = document.getElementById("pin").value;
  if (!pid) return err("กรุณาเลือกชื่อของคุณก่อน");
  if (!isFourDigit(pin)) return err("รหัสผ่านต้องเป็นตัวเลข 4 หลัก");
  busy = true; setBtn("กำลังตรวจสอบ…", true);
  try {
    const ok = await verifyPin(pid, pin);
    if (!ok) { busy = false; setBtn(doneLabel(), false); return err("รหัสผ่านไม่ถูกต้อง ลองใหม่อีกครั้ง"); }
    finish(pid);
  } catch (e) { busy = false; setBtn(doneLabel(), false); err("ไม่สำเร็จ: " + e.message); }
}

function finishAdmin() { localStorage.setItem(ME_KEY, "admin"); localStorage.setItem(AUTH_KEY, "1"); location.href = "admin.html"; }

async function doAdmin() {
  if (busy) return;
  const isReg = !!registered["admin"];
  const pin = document.getElementById("pin").value;
  if (!isFourDigit(pin)) return err("รหัสต้องเป็นตัวเลข 4 หลักเท่านั้น");
  if (!isReg && pin !== document.getElementById("pin2").value) return err("ยืนยันรหัสไม่ตรงกัน ลองใหม่อีกครั้ง");
  busy = true; setBtn("กำลังดำเนินการ…", true);
  try {
    if (isReg) {
      const ok = await verifyPin("admin", pin);
      if (!ok) { busy = false; setBtn(adminLabel(isReg), false); return err("รหัสผู้ดูแลไม่ถูกต้อง ลองใหม่อีกครั้ง"); }
    } else {
      await registerPlayer("admin", pin);
    }
    finishAdmin();
  } catch (e) { busy = false; setBtn(adminLabel(isReg), false); err("ไม่สำเร็จ: " + e.message); }
}

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
