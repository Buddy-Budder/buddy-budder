// picker.js — dropdown เลือกชื่อคนแบบสวย ๆ (รายการ + ไอคอนคนสีสดใส + เครื่องหมายถูก)
// วิธีใช้: ใส่ class="pick" ที่ <select> แล้วเรียก enhancePickers(container) หลัง render
// ตัว <select> จริงยังอยู่ (ซ่อนไว้) จึงอ่าน .value / dispatch change ได้เหมือนเดิม

// สีไอคอนของแต่ละชื่อ — คงที่ต่อชื่อ (hash → สี) ให้แต่ละคนมีสีต่างกันอย่างสดใส
function hueOf(text) {
  let h = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function avatar(label) {
  const h = hueOf(label);
  return `<span class="pick-ava" style="--h1:${h};--h2:${(h + 24) % 360}">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff" aria-hidden="true">
      <circle cx="12" cy="8" r="4"></circle>
      <path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z"></path>
    </svg></span>`;
}

function enhanceOne(sel) {
  if (sel.dataset.picked === "1") return;
  sel.dataset.picked = "1";

  const wrap = document.createElement("div");
  wrap.className = "pick-wrap";
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);           // ย้าย select เข้ามา (ซ่อนด้วย CSS)

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "pick-trigger";

  const menu = document.createElement("div");
  menu.className = "pick-menu";

  wrap.appendChild(trigger);
  wrap.appendChild(menu);

  const opts = Array.from(sel.options);

  function labelOf(o) { return o.textContent.trim(); }
  function isPlaceholder(o) { return o.value === ""; }

  function renderTrigger() {
    const o = sel.options[sel.selectedIndex] || opts[0];
    const ph = !o || isPlaceholder(o);
    trigger.innerHTML = `
      ${ph ? `<span class="pick-ava ghost">👤</span>` : avatar(labelOf(o))}
      <span class="pick-label ${ph ? "muted" : ""}">${esc(o ? labelOf(o) : "")}</span>
      <span class="pick-chev">▾</span>`;
  }

  function renderMenu() {
    // อ่าน options สด ๆ ทุกครั้งที่เปิด เพื่อสะท้อนชื่อที่ถูกเลือกไปแล้ว (option.disabled)
    menu.innerHTML = Array.from(sel.options).map((o, i) => {
      const ph = isPlaceholder(o);
      const on = i === sel.selectedIndex;
      const dis = o.disabled && !on;   // ถูกเลือกในช่องอื่นแล้ว → กดไม่ได้
      return `<button type="button" class="pick-item${on ? " on" : ""}${dis ? " dis" : ""}" data-i="${i}"${dis ? ' data-dis="1"' : ""}>
        ${ph ? `<span class="pick-ava ghost">👤</span>` : avatar(labelOf(o))}
        <span class="pick-itxt ${ph || dis ? "muted" : ""}">${esc(labelOf(o))}</span>
        ${dis ? `<span class="pick-note">เลือกไปแล้ว</span>` : `<span class="pick-chk">${on ? "✓" : ""}</span>`}
      </button>`;
    }).join("");
  }

  function open() {
    closeAll();
    renderMenu();
    wrap.classList.add("open");
    // ถ้าพื้นที่ด้านล่างไม่พอ (เช่น ช่องสุดท้าย) ให้เมนูเด้งขึ้นบนแทน จะได้ไม่หลุดกรอบ
    wrap.classList.remove("up");
    const r = trigger.getBoundingClientRect();
    const menuH = menu.offsetHeight;
    if (window.innerHeight - r.bottom < menuH + 16 && r.top > menuH + 16) wrap.classList.add("up");
    document.addEventListener("click", onDoc, true);
    document.addEventListener("keydown", onKey);
  }
  function close() {
    wrap.classList.remove("open");
    document.removeEventListener("click", onDoc, true);
    document.removeEventListener("keydown", onKey);
  }
  const onDoc = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  trigger.onclick = () => (wrap.classList.contains("open") ? close() : open());
  menu.onclick = (e) => {
    const it = e.target.closest(".pick-item");
    if (!it || it.dataset.dis === "1") return;   // ชื่อที่ถูกเลือกไปแล้ว — กดไม่ได้
    const i = +it.dataset.i;
    if (i !== sel.selectedIndex) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      renderTrigger();
    }
    close();
  };

  renderTrigger();
}

// ปิด dropdown อื่น ๆ ที่เปิดค้างอยู่
function closeAll() {
  document.querySelectorAll(".pick-wrap.open").forEach((w) => w.classList.remove("open"));
}

export function enhancePickers(root) {
  (root || document).querySelectorAll("select.pick").forEach(enhanceOne);
}

function esc(s){ return String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
