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
