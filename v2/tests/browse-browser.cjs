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
  return `<div class="watchlist-grid">${cards}<a class="watchlist-card create-tile">Create</a></div>`;
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

test("create tile matches the tallest cover in its grid", () => {
  const dom = openPage([410, 460]);
  const tile = dom.window.document.querySelector(".create-tile");
  assert.equal(tile.style.height, "460px");
  dom.window.close();
});

test("create tile height follows cover resizes and swapped grids", () => {
  const dom = openPage([410, 460]);
  const { window } = dom;
  const tile = window.document.querySelector(".create-tile");
  setHeights(window, [500, 520]);
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(tile.style.height, "520px");

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
  assert.equal(swappedTile.style.height, "380px");
  dom.window.close();
});
