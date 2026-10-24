// Shared app-shell behaviour: mobile sidebar drawer toggle.
// Pure DOM, no imports — loaded with `defer` on every page.
(function () {
  const sidebar = document.getElementById("sidebar");
  const burger = document.getElementById("navBurger");
  if (!sidebar || !burger) return;

  let backdrop = document.querySelector(".backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    document.body.appendChild(backdrop);
  }

  const close = () => { sidebar.classList.remove("open"); backdrop.classList.remove("show"); };
  burger.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    backdrop.classList.toggle("show", open);
  });
  backdrop.addEventListener("click", close);
  sidebar.querySelectorAll(".nav-item").forEach((a) => a.addEventListener("click", close));
})();
