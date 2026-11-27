function hideRequestError() {
  document.getElementById("request-error")?.setAttribute("hidden", "");
}

function clearRequestErrorOnSuccess(event) {
  if (event.detail?.successful) hideRequestError();
}

function syncWatchlistFilterToggle(unwatched) {
  const value = unwatched ? "true" : "false";
  document.querySelectorAll(".filter-toggle .filter-button[data-unwatched]").forEach((button) => {
    const active = button.dataset.unwatched === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const state = document.getElementById("unwatched-state");
  if (state) state.value = value;
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest(".filter-toggle .filter-button[data-unwatched]");
  if (!button) return;
  syncWatchlistFilterToggle(button.dataset.unwatched === "true");
});

document.addEventListener("htmx:responseError", () => {
  document.getElementById("request-error")?.removeAttribute("hidden");
});
document.addEventListener("htmx:sendError", () => {
  document.getElementById("request-error")?.removeAttribute("hidden");
});
document.addEventListener("htmx:afterRequest", clearRequestErrorOnSuccess);
