// โมดูลล็อกอิน/รหัสผ่าน — ต่อยอดจาก db.js (ไม่แก้ db.js)
// เก็บรหัส 4 หลักเป็นค่า hash (SHA-256 ผสม pid) ใน players/{id} เพื่อไม่ให้ใครอ่านรหัสจริงได้
import { db } from "./db.js";
import {
  doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const playersCol = () => collection(db, "players");
const playerRef = (pid) => doc(db, "players", pid);
const stateRef = () => doc(db, "game", "state");

// ตั้ง/ล้างวันเวลาปิดรับคำตอบ — เก็บเป็น epoch ms ในเอกสาร game/state (null = ไม่มีกำหนด)
// เขียนลงเอกสารเดิมที่ db.js ใช้อยู่ จึงไม่ต้องแก้ db.js และไม่ต้องสร้าง collection ใหม่
export async function setDeadline(ms) {
  await updateDoc(stateRef(), { deadline: ms ?? null });
}

// เปิด/ปิดให้ผู้เล่นกรอก "เฉลยลับ" (ส่วนที่ 1) — ค่าเริ่มต้นถือว่าปิด (ยังไม่มีฟิลด์ = ล็อก)
// เขียนลงเอกสาร game/state เดิม จึงไม่ต้องแก้ db.js และไหลเข้า watchState อัตโนมัติ
export async function setTruthOpen(open) {
  await updateDoc(stateRef(), { truthOpen: !!open });
}

// แปลงรหัส 4 หลักเป็นลายนิ้วมือ (hash) — ผูกกับ pid เพื่อให้รหัสซ้ำกันได้ค่าต่างกัน
async function hashPin(pid, pin) {
  const data = new TextEncoder().encode(pid + "|" + pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const isFourDigit = (pin) => /^\d{4}$/.test(pin);

// ลงทะเบียนครั้งแรก — สร้างรหัสให้ผู้เล่น
export async function registerPlayer(pid, pin) {
  if (!isFourDigit(pin)) throw new Error("รหัสต้องเป็นตัวเลข 4 หลัก");
  const pinHash = await hashPin(pid, pin);
  await setDoc(playerRef(pid), { pinHash, createdAt: Date.now() });
}

// ตรวจรหัสตอนกลับเข้ามาใหม่
export async function verifyPin(pid, pin) {
  const snap = await getDoc(playerRef(pid));
  if (!snap.exists()) return false;
  const got = await hashPin(pid, pin);
  return snap.data().pinHash === got;
}

// เคยลงทะเบียนหรือยัง
export async function isRegistered(pid) {
  const snap = await getDoc(playerRef(pid));
  return snap.exists();
}

// ดูสถานะการลงทะเบียนแบบสด (ใช้ในหน้าแอดมิน + หน้าล็อกอิน)
export function watchPlayers(cb) {
  return onSnapshot(playersCol(), (qs) => {
    const ids = {};
    qs.forEach((d) => { ids[d.id] = true; });
    cb(ids);
  }, (err) => {
    // อ่านไม่ได้ (เช่น rules ยังไม่อนุญาต players) → ถือว่ายังไม่มีใครลงทะเบียน ไม่ให้หน้าค้าง
    console.error("watchPlayers:", err.code || err.message);
    cb({});
  });
}

// แอดมินรีเซ็ตรหัสให้คนที่ลืม (ลบ doc → ผู้เล่นกลับไปตั้งรหัสใหม่ได้)
export async function resetPlayer(pid) {
  await deleteDoc(playerRef(pid));
}
