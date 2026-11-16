function setBrowseBusy(busy) {
  document.getElementById("watchlist-browse")?.setAttribute("aria-busy", String(busy));
}

function setBrowseStatus(message) {
  const status = document.getElementById("browse-status");
  if (status) status.textContent = message;
}

function announceBrowseFailure() {
  setBrowseStatus("Unable to load watchlists. Please try again.");
}

function applySortChoice(link, menu) {
  document.getElementById("orderBy").value = link.dataset.sortValue;
  document.getElementById("orderDirection").value = link.dataset.sortDirection;
  document.getElementById("sort-label").textContent = link.dataset.sortLabel;
  menu.querySelectorAll("[data-sort-value]").forEach((option) => {
    option.removeAttribute("aria-current");
  });
  link.setAttribute("aria-current", "true");
  menu
    .querySelector("summary")
    .setAttribute("aria-label", `Sort watchlists: ${link.dataset.sortLabel}`);
  menu.open = false;
  document.getElementById("watchlist-search").requestSubmit();
}

function initializeSortMenu() {
  const menu = document.getElementById("sort-menu");
  if (!menu) return;
  menu.addEventListener("click", (event) => {
    const link = event.target.closest("[data-sort-value]");
    if (!link) return;
    event.preventDefault();
    applySortChoice(link, menu);
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") menu.open = false;
  });
}

function closeSortMenuOnOutsideClick(event) {
  const menu = document.getElementById("sort-menu");
  if (!menu) return;
  if (!menu.contains(event.target)) menu.open = false;
}

document.addEventListener("click", closeSortMenuOnOutsideClick);
document.addEventListener("htmx:responseError", announceBrowseFailure);
document.addEventListener("htmx:sendError", announceBrowseFailure);
document.addEventListener("htmx:beforeRequest", () => {
  setBrowseBusy(true);
  setBrowseStatus("Loading watchlists…");
});
document.addEventListener("htmx:afterRequest", (event) => {
  setBrowseBusy(false);
  if (event.detail?.successful) setBrowseStatus("");
});
initializeSortMenu();
