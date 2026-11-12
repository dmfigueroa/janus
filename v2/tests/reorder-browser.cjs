const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
test("keyboard reorder saves intent and restores authoritative order and focus after failure", async () => {
  const markup =
    '<p id="reorder-status" role="status"></p><div class="timeline" data-reorder-url="/reorder" data-mode="custom"><article data-item-id="1"><button class="reorder-handle">Move first</button></article><article data-item-id="2"><button class="reorder-handle">Move second</button></article></div>';
  const dom = new JSDOM(markup, {
    url: "https://janus.example/v2/watchlists/41?query=first",
    runScripts: "outside-only",
  });
  const window = dom.window;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.getClientRects = () => [1];
  window.eval(fs.readFileSync(path.join(root, "static/vendor/Sortable.min.js"), "utf8"));
  const calls = [];
  window.fetch = async (url, options) => {
    calls.push({ url, options });
    return options
      ? { ok: true, json: async () => ({ success: false, message: "Stale anchor" }) }
      : { ok: true, text: async () => markup };
  };
  window.eval(fs.readFileSync(path.join(root, "static/app.js"), "utf8"));
  const button = window.document.querySelector("button");
  button.focus();
  button.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
  );
  assert.equal(window.document.querySelector("article").dataset.itemId, "2");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    movedItemId: 1,
    referenceItemId: 2,
    position: "after",
  });
  assert.equal(calls.length, 2);
  assert.equal(window.document.querySelector("article").dataset.itemId, "1");
  assert.equal(window.document.activeElement.closest("article").dataset.itemId, "1");
  assert.match(window.document.getElementById("reorder-status").textContent, /Stale anchor/);
  dom.window.close();
});

test("collapsed watched groups reject incoming drops while expanded groups accept them", () => {
  const dom = new JSDOM(
    '<p id="reorder-status"></p><div class="timeline" data-reorder-url="/reorder" data-mode="custom"><article data-item-id="1"></article><details><summary>Watched</summary><article data-item-id="2"></article></details><article data-item-id="3"></article></div>',
    { url: "https://janus.example/v2/watchlists/41", runScripts: "outside-only" },
  );
  const { window } = dom;
  window.eval(fs.readFileSync(path.join(root, "static/vendor/Sortable.min.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(root, "static/app.js"), "utf8"));
  const timeline = window.document.querySelector(".timeline");
  const group = window.document.querySelector("details");
  const source = window.Sortable.get(timeline);
  const destination = window.Sortable.get(group);
  const moved = timeline.querySelector('[data-item-id="3"]');
  const acceptsDrop = () => destination.options.group.checkPut(destination, source, moved, {});
  assert.equal(acceptsDrop(), false);
  group.open = true;
  assert.equal(acceptsDrop(), true);
  assert.deepEqual(
    [...timeline.querySelectorAll("article")].map((row) => row.dataset.itemId),
    ["1", "2", "3"],
  );
  dom.window.close();
});
