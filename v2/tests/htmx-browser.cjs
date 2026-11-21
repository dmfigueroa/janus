const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");
const { installReorderModules } = require("./reorder-browser-fixtures.cjs");
const root = path.resolve(__dirname, "..");

function timeline(itemIds) {
  const rows = itemIds
    .map(
      (id) =>
        `<article data-item-id="${id}"><button class="reorder-handle">Move ${id}</button></article>`,
    )
    .join("");
  return `<watchlist-reorder class="timeline" hx-post="/reorder?query=first" hx-trigger="reorder" hx-target="this" hx-select=".timeline > *" hx-swap="innerHTML">${rows}</watchlist-reorder>`;
}

function page(itemIds) {
  return `<span id="reorder-recovery" hidden hx-get="" hx-trigger="reconcile" hx-target=".timeline" hx-select=".timeline > *" hx-swap="innerHTML"></span><form><input id="query" value="first" /></form>${timeline(itemIds).replace("</watchlist-reorder>", '<p id="reorder-status" role="status"></p></watchlist-reorder>')}`;
}

async function verifyReorder({ failPost, methods, status }) {
  const http = require("node:http");
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({ method: request.method, headers: request.headers, body });
      if (failPost && request.method === "POST") {
        response.writeHead(500);
        response.end("Failed to save");
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(page([2, 1]).replace('role="status"></p>', 'role="status">Order saved.</p>'));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dom = new JSDOM(page([1, 2]), {
    url: `http://127.0.0.1:${server.address().port}/v2/watchlists/41?query=first`,
    runScripts: "outside-only",
  });
  try {
    const { window } = dom;
    window.scrollTo = () => {};
    window.HTMLElement.prototype.getClientRects = () => [1];
    // jsdom requires an explicit XPath result type; browsers supply its default.
    const evaluate = window.XPathExpression.prototype.evaluate;
    window.XPathExpression.prototype.evaluate = function (context, type, result) {
      return evaluate.call(this, context, type ?? 0, result);
    };
    window.eval(fs.readFileSync(path.join(root, "static/vendor/htmx.min.js"), "utf8"));
    window.eval(fs.readFileSync(path.join(root, "static/vendor/Sortable.min.js"), "utf8"));
    window.eval(fs.readFileSync(path.join(root, "static/app.js"), "utf8"));
    installReorderModules(window);
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    const completed = new Promise((resolve) =>
      window.document.addEventListener("htmx:afterSwap", resolve, { once: true }),
    );
    window.document
      .querySelector("button")
      .dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
      );
    await completed;
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    assert.deepEqual(
      requests.map((request) => request.method),
      methods,
    );
    assert.equal(requests[0].headers["hx-request"], "true");
    assert.match(requests[0].headers["content-type"], /application\/x-www-form-urlencoded/);
    assert.equal(new URLSearchParams(requests[0].body).get("movedItemId"), "1");
    assert.equal(window.document.querySelector("article").dataset.itemId, "2");
    assert.equal(window.document.getElementById("reorder-status").textContent, status);
    assert.equal(window.document.activeElement.closest("article").dataset.itemId, "1");
    assert.equal(window.document.querySelector(".timeline").hasAttribute("aria-busy"), false);
  } finally {
    dom.window.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("real HTMX uses hx-post and swaps server HTML without a follow-up GET", () =>
  verifyReorder({ failPost: false, methods: ["POST"], status: "Order saved." }));
test("real HTMX uses hx-get to recover from a failed save", () =>
  verifyReorder({
    failPost: true,
    methods: ["POST", "GET"],
    status: "Current order restored. Check the order before trying again.",
  }));

function detailPageHtml(mode) {
  const modes = {
    release: {
      timelineHtml: '<div class="timeline"><h2>2020</h2><article data-item-id="1"></article></div>',
      releaseChecked: "checked",
      customChecked: "",
    },
    custom: {
      timelineHtml: timeline([1, 2]),
      releaseChecked: "",
      customChecked: "checked",
    },
  };
  const { timelineHtml, releaseChecked, customChecked } = modes[mode];
  return `<main class="watchlist">
      <button type="button" data-watchlist-dialog-open="edit" data-watchlist-dialog-trigger="header">Edit</button>
      ${timelineHtml}
    </main>
    <span id="watchlist-refresh" hidden hx-get="" hx-trigger="watchlist-saved from:body" hx-target=".watchlist" hx-select=".watchlist" hx-select-oob="#watchlist-form" hx-swap="outerHTML"></span>
    <p id="notification" role="status" hidden></p>
    <dialog id="watchlist-dialog">
      <form id="watchlist-form">
        <input id="watchlist-name" name="name" value="MCU" />
        <input type="radio" name="itemOrderMode" value="release" ${releaseChecked} />
        <input type="radio" name="itemOrderMode" value="custom" ${customChecked} />
      </form>
    </dialog>`;
}

function patchDialogEnvironment(window) {
  window.CSS = { escape: (value) => value };
  const evaluate = window.XPathExpression.prototype.evaluate;
  window.XPathExpression.prototype.evaluate = function (context, type, result) {
    return evaluate.call(this, context, type ?? 0, result);
  };
  const prototype = window.HTMLDialogElement.prototype;
  prototype.showModal = function showModal() {
    this.open = true;
    this.setAttribute("open", "");
  };
  prototype.close = function close() {
    this.open = false;
    this.removeAttribute("open");
    this.dispatchEvent(new window.Event("close"));
  };
}

test("real HTMX detail refresh updates timeline and edit dialog defaults via OOB swap", async () => {
  const http = require("node:http");
  const server = http.createServer((_, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(detailPageHtml("custom"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dom = new JSDOM(detailPageHtml("release"), {
    url: `http://127.0.0.1:${server.address().port}/v2/watchlists/41?unwatched=false`,
    runScripts: "outside-only",
  });
  try {
    const { window } = dom;
    patchDialogEnvironment(window);
    window.eval(fs.readFileSync(path.join(root, "static/vendor/htmx.min.js"), "utf8"));
    window.eval(fs.readFileSync(path.join(root, "static/watchlist-dialog.js"), "utf8"));
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    const trigger = window.document.querySelector('[data-watchlist-dialog-open="edit"]');
    trigger.focus();
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    const settled = new Promise((resolve) =>
      window.document.addEventListener("htmx:afterSettle", resolve, { once: true }),
    );
    window.document.body.dispatchEvent(
      new window.CustomEvent("watchlist-saved", {
        bubbles: true,
        detail: { mode: "edit", message: "Changes saved successfully" },
      }),
    );
    await settled;
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    assert.ok(window.document.querySelector("watchlist-reorder"));
    assert.equal(window.document.getElementById("watchlist-dialog").open, false);
    assert.equal(window.document.activeElement.getAttribute("data-watchlist-dialog-open"), "edit");
    window.document.activeElement.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    assert.equal(window.document.querySelector('input[value="custom"]').checked, true);
    assert.equal(window.document.querySelector('input[value="release"]').checked, false);
  } finally {
    dom.window.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
