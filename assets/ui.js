// ui.js — กล่อง popup สวย ๆ สไตล์เกม (แทน alert/confirm/prompt ของเบราว์เซอร์)
// ทุกฟังก์ชันคืน Promise · ผูกไว้นอก #app จึงไม่ถูก render ทับ
// ใช้: await uiAlert(msg) · const ok = await uiConfirm(msg) · const name = await uiPrompt(msg,{value})

// สร้างกล่องแล้วคืน Promise — kind: "alert" | "confirm" | "prompt"
function openModal(kind, message, opts = {}) {
  const {
    title = "",
    icon = kind === "prompt" ? "✏️" : kind === "confirm" ? "❓" : "✨",
    okText = kind === "prompt" ? "บันทึก" : "ตกลง",
    cancelText = "ยกเลิก",
    value = "",
    placeholder = "",
    danger = false,
  } = opts;

  return new Promise((resolve) => {
    // ปิดกล่องเดิมถ้ามีค้าง (กันซ้อน)
    document.querySelectorAll(".modal-backdrop").forEach((n) => n.remove());

    const bd = document.createElement("div");
    bd.className = "modal-backdrop";
    bd.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-ic">${icon}</div>
        ${title ? `<h3 class="modal-title">${esc(title)}</h3>` : ""}
        <p class="modal-msg">${esc(message)}</p>
        ${kind === "prompt"
          ? `<input class="modal-input" id="mInput" type="text" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">`
          : ""}
        <div class="modal-actions">
          ${kind !== "alert"
            ? `<button class="btn ghost" id="mCancel">${esc(cancelText)}</button>`
            : ""}
          <button class="btn${danger ? " warn" : ""}" id="mOk">${esc(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(bd);

    const card = bd.querySelector(".modal-card");
    const input = bd.querySelector("#mInput");
    const okBtn = bd.querySelector("#mOk");
    const cancelBtn = bd.querySelector("#mCancel");

    // เปิดฉากเข้า (ให้ CSS transition ทำงาน)
    requestAnimationFrame(() => bd.classList.add("show"));

    const close = (result) => {
      bd.classList.remove("show");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => bd.remove(), 180);
      resolve(result);
    };
    const onOk = () => close(kind === "prompt" ? (input.value || "") : true);
    const onCancel = () => close(kind === "prompt" ? null : false);
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter" && kind !== "alert") { e.preventDefault(); onOk(); }
    };

    okBtn.onclick = onOk;
    if (cancelBtn) cancelBtn.onclick = onCancel;
    // คลิกพื้นหลัง = ยกเลิก (คลิกบนการ์ดไม่ปิด)
    bd.onclick = (e) => { if (e.target === bd) onCancel(); };
    document.addEventListener("keydown", onKey);

    // โฟกัสให้พร้อมพิมพ์/กดทันที
    if (input) { input.focus(); input.select(); } else okBtn.focus();
  });
}

export function uiAlert(message, opts = {})   { return openModal("alert", message, opts); }
export function uiConfirm(message, opts = {}) { return openModal("confirm", message, opts); }
export function uiPrompt(message, opts = {})  { return openModal("prompt", message, opts); }

function esc(s){ return String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
