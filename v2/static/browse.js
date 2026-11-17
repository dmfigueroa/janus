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

function isPageLink(element) {
  if (!element) return false;
  if (typeof element.matches !== "function") return false;
  return element.matches("[data-page-link]");
}

function focusHeading(id) {
  const heading = document.getElementById(id);
  if (heading) heading.focus();
}

function requestElement(event) {
  if (!event.detail) return null;
  if (!event.detail.requestConfig) return null;
  return event.detail.requestConfig.elt;
}

function focusPageResults(event) {
  const element = requestElement(event);
  if (!isPageLink(element)) return;
  focusHeading("browse-heading");
}

function createTile() {
  return document.querySelector(".watchlist-grid .create-tile");
}

function siblingCards(tile) {
  return [...tile.parentElement.querySelectorAll(".watchlist-card:not(.create-tile)")];
}

function cardHeight(card) {
  return card.getBoundingClientRect().height;
}

function tallestCard(cards) {
  return Math.max(0, ...cards.map(cardHeight));
}

function setCreateTileHeight() {
  const tile = createTile();
  if (!tile) return;
  const height = tallestCard(siblingCards(tile));
  if (height > 0) tile.style.height = `${height}px`;
}

document.addEventListener("htmx:responseError", announceBrowseFailure);
document.addEventListener("htmx:sendError", announceBrowseFailure);
document.addEventListener("htmx:beforeRequest", () => {
  setBrowseBusy(true);
});
document.addEventListener("htmx:afterSwap", focusPageResults);
document.addEventListener("htmx:afterRequest", (event) => {
  setBrowseBusy(false);
  if (event.detail?.successful) setBrowseStatus("");
});
document.addEventListener("htmx:afterSwap", setCreateTileHeight);
window.addEventListener("resize", setCreateTileHeight);
setCreateTileHeight();
