const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function timeline(itemIds) {
  const rows = itemIds
    .map(
      (id) =>
        `<article data-item-id="${id}"><button class="reorder-handle">Move ${id}</button></article>`,
    )
    .join("");
  return `<div class="timeline" data-reorder-url="/reorder" data-mode="custom">${rows}</div>`;
}

function page(itemIds) {
  return `<form><input id="query" value="first" /></form>${timeline(itemIds).replace("</div>", '<p id="reorder-status" role="status"></p></div>')}`;
}

function setScrollPosition(window, scrollY) {
  if (!scrollY) return;
  Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true });
}

function openReorderPage(markup, respond, { scrollY = 0 } = {}) {
  const dom = new JSDOM(markup, {
    url: "https://janus.example/v2/watchlists/41?query=first",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const scrolled = [];
  window.scrollTo = ({ top }) => scrolled.push(top);
  setScrollPosition(window, scrollY);
  window.HTMLElement.prototype.getClientRects = () => [1];
  window.eval(fs.readFileSync(path.join(root, "static/vendor/Sortable.min.js"), "utf8"));
  const calls = [];
  window.htmx = {
    async ajax(method, url, context) {
      const options =
        method === "POST" ? { method, body: JSON.stringify(context.values) } : undefined;
      calls.push({ url, options });
      const response = await respond(url, options);
      if (!response.ok) throw new Error("Request failed");
      const result = new window.DOMParser().parseFromString(await response.text(), "text/html");
      context.target.replaceChildren(...result.querySelector(".timeline").childNodes);
    },
  };
  window.eval(fs.readFileSync(path.join(root, "static/app.js"), "utf8"));
  return { dom, window, calls, scrolled };
}

test("keyboard reorder saves intent and restores authoritative order and focus after failure", async () => {
  const markup = page([1, 2]);
  const { dom, window, calls } = openReorderPage(markup, (_, options) =>
    options
      ? {
          ok: true,
          text: async () => markup.replace('role="status"></p>', 'role="status">Stale anchor</p>'),
        }
      : { ok: true, text: async () => markup },
  );
  const button = window.document.querySelector("button");
  button.focus();
  button.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
  );
  assert.equal(window.document.querySelector("article").dataset.itemId, "2");
  assert.equal(window.document.getElementById("reorder-status").textContent, "Saving order…");
  const swap = new window.Event("htmx:beforeSwap", { cancelable: true });
  window.document.dispatchEvent(swap);
  assert.equal(swap.defaultPrevented, true, "fragment swaps wait for the save and reconcile");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    movedItemId: "1",
    referenceItemId: "2",
    position: "after",
  });
  assert.equal(calls.length, 1);
  assert.equal(window.document.querySelector("article").dataset.itemId, "1");
  assert.equal(window.document.activeElement.closest("article").dataset.itemId, "1");
  assert.match(window.document.getElementById("reorder-status").textContent, /Stale anchor/);
  dom.window.close();
});

test("drops submit the visible anchor and preserve filters, scroll and focus on success", async () => {
  const { dom, window, calls, scrolled } = openReorderPage(
    page([1, 2]),
    (_, options) =>
      options
        ? {
            ok: true,
            text: async () =>
              timeline([2, 1]).replace("</div>", '<p id="reorder-status">Order saved.</p></div>'),
          }
        : { ok: true, text: async () => timeline([2, 1]) },
    { scrollY: 420 },
  );
  const timelineElement = window.document.querySelector(".timeline");
  const sortable = window.Sortable.get(timelineElement);
  const first = timelineElement.querySelector('[data-item-id="1"]');
  const second = timelineElement.querySelector('[data-item-id="2"]');
  timelineElement.insertBefore(second, first);
  sortable.options.onEnd({
    item: second,
    from: timelineElement,
    to: timelineElement,
    oldIndex: 1,
    newIndex: 0,
  });
  assert.deepEqual(
    [...timelineElement.querySelectorAll("article")].map((row) => row.dataset.itemId),
    ["2", "1"],
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    movedItemId: "2",
    referenceItemId: "1",
    position: "before",
  });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).search, window.location.search);
  assert.equal(window.document.getElementById("query").value, "first");
  assert.equal(window.document.getElementById("reorder-status").textContent, "Order saved.");
  assert.deepEqual(scrolled, [420]);
  assert.equal(window.document.activeElement.closest("article").dataset.itemId, "2");
  dom.window.close();
});

test("failed reconciliation requests a refresh instead of implying a saved order", async () => {
  const { dom, window } = openReorderPage(page([1, 2]), () => ({ ok: false }));
  const button = window.document.querySelector("button");
  button.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(
    window.document.getElementById("reorder-status").textContent,
    /Refresh before reordering again/,
  );
  assert.equal(button.disabled, true);
  dom.window.close();
});

test("active drags block fragment swaps and swaps do not duplicate initialization", () => {
  const { dom, window } = openReorderPage(page([1, 2]), () => {
    throw new Error("No request expected");
  });
  const timelineElement = window.document.querySelector(".timeline");
  const sortable = window.Sortable.get(timelineElement);
  sortable.options.onStart();
  const duringDrag = new window.Event("htmx:beforeSwap", { cancelable: true });
  window.document.dispatchEvent(duringDrag);
  assert.equal(duringDrag.defaultPrevented, true);
  sortable.options.onEnd({
    item: timelineElement.querySelector('[data-item-id="1"]'),
    from: timelineElement,
    to: timelineElement,
    oldIndex: 0,
    newIndex: 0,
  });
  const afterDrag = new window.Event("htmx:beforeSwap", { cancelable: true });
  window.document.dispatchEvent(afterDrag);
  assert.equal(afterDrag.defaultPrevented, false);
  window.document.dispatchEvent(new window.Event("htmx:load"));
  assert.equal(window.Sortable.get(timelineElement), sortable);
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
  const timelineElement = window.document.querySelector(".timeline");
  const group = window.document.querySelector("details");
  const source = window.Sortable.get(timelineElement);
  const destination = window.Sortable.get(group);
  const moved = timelineElement.querySelector('[data-item-id="3"]');
  const acceptsDrop = () => destination.options.group.checkPut(destination, source, moved, {});
  assert.equal(acceptsDrop(), false);
  group.open = true;
  assert.equal(acceptsDrop(), true);
  assert.deepEqual(
    [...timelineElement.querySelectorAll("article")].map((row) => row.dataset.itemId),
    ["1", "2", "3"],
  );
  dom.window.close();
});
