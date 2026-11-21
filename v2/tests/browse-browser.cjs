const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function page(cardHeights) {
  const cards = cardHeights
    .map(
      (_, index) =>
        `<div class="watchlist-card" data-card="${index}"><a class="card-cover"></a></div>`,
    )
    .join("");
  return `<watchlist-browser>
    <form id="watchlist-search"></form>
    <p id="browse-status" role="status"></p>
    <div id="watchlist-browse" aria-busy="false">
      <div class="browse-heading"><h2 tabindex="-1">Search results</h2></div>
      <div class="watchlist-grid">${cards}<a class="watchlist-card create-tile">Create</a></div>
      <a data-page-link>Next page</a>
    </div>
  </watchlist-browser>`;
}

function setHeights(window, heights) {
  window.document.querySelectorAll(".card-cover").forEach((cover, index) => {
    cover.getBoundingClientRect = () => ({ height: heights[index] });
  });
}

function openPage(heights) {
  const dom = new JSDOM(page(heights), {
    url: "https://janus.example/v2/watchlists",
    runScripts: "outside-only",
  });
  setHeights(dom.window, heights);
  dom.window.eval(fs.readFileSync(path.join(root, "static/browse.js"), "utf8"));
  return dom;
}

test("create tile geometry is owned by CSS across resizes and swapped grids", () => {
  const dom = openPage([410, 460]);
  const { window } = dom;
  const tile = window.document.querySelector(".create-tile");
  setHeights(window, [500, 520]);
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(tile.style.height, "");

  window.document.querySelector(".watchlist-grid").replaceChildren(
    Object.assign(window.document.createElement("div"), {
      className: "watchlist-card",
      innerHTML: '<a class="card-cover"></a>',
    }),
    Object.assign(window.document.createElement("a"), {
      className: "watchlist-card create-tile",
    }),
  );
  window.document.querySelector(".card-cover").getBoundingClientRect = () => ({ height: 380 });
  window.document.dispatchEvent(new window.CustomEvent("htmx:afterSwap", { bubbles: true }));
  const swappedTile = window.document.querySelector(".create-tile");
  assert.equal(swappedTile.style.height, "");
  const stylesheet = fs.readFileSync(path.join(root, "static/app.css"), "utf8");
  assert.match(stylesheet, /\.create-tile\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s);
  dom.window.close();
});

test("search status and continuation lifecycle stay inside the Watchlist browser", () => {
  const dom = openPage([]);
  const { window } = dom;
  const browser = window.document.querySelector("watchlist-browser");
  const browse = browser.querySelector("#watchlist-browse");
  const search = browser.querySelector("#watchlist-search");
  const pageLink = browser.querySelector("[data-page-link]");
  const searchRequest = {};
  const pageRequest = {};
  const event = (type, xhr, element, successful = false) =>
    new window.CustomEvent(type, {
      bubbles: true,
      detail: { xhr, successful, requestConfig: { elt: element } },
    });

  search.dispatchEvent(event("htmx:beforeRequest", searchRequest, search));
  assert.equal(browse.getAttribute("aria-busy"), "true");

  pageLink.dispatchEvent(event("htmx:beforeRequest", pageRequest, pageLink));
  pageLink.remove();
  browse.dispatchEvent(event("htmx:afterSwap", pageRequest, pageLink));
  assert.equal(window.document.activeElement, browse.querySelector(".browse-heading h2"));

  browser.dispatchEvent(event("htmx:afterRequest", pageRequest, pageLink, true));
  assert.equal(browse.getAttribute("aria-busy"), "true");
  browser.dispatchEvent(event("htmx:afterRequest", searchRequest, search, true));
  assert.equal(browse.getAttribute("aria-busy"), "false");

  const unrelated = window.document.createElement("button");
  window.document.body.append(unrelated);
  unrelated.dispatchEvent(event("htmx:responseError", {}, unrelated));
  assert.equal(browser.querySelector("#browse-status").textContent, "");

  search.dispatchEvent(event("htmx:beforeRequest", searchRequest, search));
  search.dispatchEvent(event("htmx:sendError", searchRequest, search));
  assert.equal(
    browser.querySelector("#browse-status").textContent,
    "Unable to load watchlists. Please try again.",
  );
  browser.dispatchEvent(event("htmx:afterRequest", searchRequest, search));
  assert.equal(browse.getAttribute("aria-busy"), "false");
  assert.equal(
    browser.querySelector("#browse-status").textContent,
    "Unable to load watchlists. Please try again.",
  );
  dom.window.close();
});
