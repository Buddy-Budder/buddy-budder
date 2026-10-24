// โมดูลฐานข้อมูลกลาง — ไม่ต้องแก้ไฟล์นี้
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, collection, setDoc, getDoc, getDocs,
  onSnapshot, updateDoc, deleteDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ---- references ----
export const stateRef = () => doc(db, "game", "state");
export const truthCol = () => collection(db, "truth");
export const guessCol = () => collection(db, "guesses");
export const truthRef = (pid) => doc(db, "truth", pid);
export const guessRef = (pid) => doc(db, "guesses", pid);

// ---- state helpers ----
// phase: "setup" | "open" | "revealed"
export async function ensureState() {
  const s = await getDoc(stateRef());
  if (!s.exists()) {
    await setDoc(stateRef(), { participants: [], phase: "setup", updatedAt: serverTimestamp() });
  }
}
export async function saveParticipants(list) {
  await updateDoc(stateRef(), { participants: list, updatedAt: serverTimestamp() });
}
export async function setPhase(phase) {
  await updateDoc(stateRef(), { phase, updatedAt: serverTimestamp() });
}
export function watchState(cb) { return onSnapshot(stateRef(), (d) => cb(d.data() || null)); }
export function watchTruth(cb) {
  return onSnapshot(truthCol(), (snap) => {
    const m = {}; snap.forEach((d) => (m[d.id] = d.data())); cb(m);
  });
}
export function watchGuesses(cb) {
  return onSnapshot(guessCol(), (snap) => {
    const arr = []; snap.forEach((d) => arr.push({ id: d.id, ...d.data() })); cb(arr);
  });
}
export async function getTruthOnce() {
  const snap = await getDocs(truthCol()); const m = {}; snap.forEach((d) => (m[d.id] = d.data())); return m;
}
export async function getGuessesOnce() {
  const snap = await getDocs(guessCol()); const a = []; snap.forEach((d) => a.push({ id: d.id, ...d.data() })); return a;
}

// ---- player writes ----
export async function submitTruth(pid, name, drew) {
  await setDoc(truthRef(pid), { by: name, drew, at: serverTimestamp() });
}
export async function submitGuess(pid, name, picks) {
  await setDoc(guessRef(pid), { name, picks, at: serverTimestamp() });
}

// ---- admin resets ----
export async function resetPerson(pid) {
  await deleteDoc(truthRef(pid)).catch(() => {});
  await deleteDoc(guessRef(pid)).catch(() => {});
}
export async function resetAll(list) {
  const t = await getDocs(truthCol()); for (const d of t.docs) await deleteDoc(d.ref);
  const g = await getDocs(guessCol()); for (const d of g.docs) await deleteDoc(d.ref);
  await setDoc(stateRef(), { participants: list || [], phase: "setup", updatedAt: serverTimestamp() });
}

// ---- scoring ----
// คะแนนของผู้ทาย = จำนวนแถวที่ทายตรงกับเฉลยจริง
export function computeScores(participants, truth, guesses) {
  const rows = guesses.map((g) => {
    let correct = 0, answered = 0;
    for (const p of participants) {
      if (p.id === g.id) continue;              // ไม่นับแถวของตัวเอง
      const pick = g.picks ? g.picks[p.id] : null;
      const real = truth[p.id] ? truth[p.id].drew : null;
      if (pick) answered++;
      if (pick && real && pick === real) correct++;
    }
    return { id: g.id, name: g.name, correct, answered };
  });
  rows.sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name, "th"));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (r.correct !== prev) { rank = i + 1; prev = r.correct; } r.rank = rank; });
  return rows;
}

export function nameOf(participants, id) {
  const p = participants.find((x) => x.id === id); return p ? p.name : "—";
}
