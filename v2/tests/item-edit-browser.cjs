const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function itemRow(id, title) {
  return `<article data-item-id="${id}"><div class="item-content"><h3>${title}</h3></div><div class="item-controls"><div class="item-actions" data-item-actions="${id}"><button type="button" class="item-actions-trigger" data-item-actions-trigger="${id}" aria-label="More actions for ${title}" aria-haspopup="true" aria-expanded="false" aria-controls="item-actions-menu-${id}">...</button><div id="item-actions-menu-${id}" class="item-actions-menu" hidden><button type="button" class="item-action-button" data-item-edit-open="${id}" hx-get="/v2/watchlists/41/items/${id}/edit" hx-target="#item-edit-form" hx-swap="outerHTML">Edit</button></div></div></div></article>`;
}

function detailHtml(rowsHtml, query = "") {
  return `<main class="watchlist"><header class="watchlist-header"><h1 tabindex="-1">Queue</h1></header><form class="watchlist-toolbar"><input id="query" name="query" value="${query}" /></form><div class="timeline">${rowsHtml}</div></main><span id="watchlist-refresh" hidden hx-get="" hx-trigger="watchlist-saved from:body, watchlist-item-saved from:body" hx-target=".watchlist" hx-select=".watchlist" hx-swap="outerHTML"></span><p id="notification" role="status" hidden></p><dialog id="item-edit-dialog" class="dialog" aria-labelledby="item-edit-dialog-title" aria-describedby="item-edit-dialog-help" data-item-edit-dialog><header class="dialog-header"><h2 id="item-edit-dialog-title">Edit watchlist item</h2><p id="item-edit-dialog-help">Update metadata.</p></header><button type="button" class="dialog-close" data-item-edit-dialog-close aria-label="Close edit dialog">X</button><form id="item-edit-form" class="dialog-form"></form></dialog>`;
}

function editFormHtml() {
  return `<form id="item-edit-form" class="dialog-form" method="post" action="/v2/watchlists/41/items/101" hx-post="/v2/watchlists/41/items/101" hx-target="#item-edit-form" hx-swap="outerHTML" data-item-id="101"><input id="item-edit-title" name="title" type="text" value="Movie" required /><input id="item-edit-release-date" name="releaseDate" type="text" value="2024-01-01" /><button type="button" data-clear-release-date>Clear date</button><input id="item-edit-poster" name="posterPath" type="text" value="/current.jpg" /><div data-poster-preview-wrap><img data-poster-preview src="https://image.tmdb.org/t/p/w500/current.jpg" alt="Poster preview for Movie" referrerpolicy="no-referrer" /></div><p id="item-edit-form-error" role="alert"></p><footer class="dialog-footer"><button type="button" data-item-edit-dialog-close>Cancel</button><button type="submit">Save</button></footer></form>`;
}

function patchDom(window) {
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

function installItemEditModules(window) {
  const fields = fs
    .readFileSync(path.join(root, "static/item-edit-fields.js"), "utf8")
    .replaceAll(/^export /gm, "");
  const dialog = fs
    .readFileSync(path.join(root, "static/item-edit-dialog.js"), "utf8")
    .replace(/^import [\s\S]*?;\n/m, "");
  window.eval(`${fields}\n${dialog}`);
}

function openStandalone(markup) {
  const dom = new JSDOM(markup, {
    url: "https://janus.example/v2/watchlists/41",
    runScripts: "outside-only",
  });
  patchDom(dom.window);
  installItemEditModules(dom.window);
  const click = (element) =>
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  const emit = (type, detail) =>
    dom.window.document.dispatchEvent(new dom.window.CustomEvent(type, { bubbles: true, detail }));
  return { dom, window: dom.window, click, emit };
}

test("menu opens, closes on Escape, and opens modal dialog with live no-referrer preview and date clear", () => {
  const { dom, window, click, emit } = openStandalone(detailHtml(itemRow(101, "Movie")));
  const trigger = window.document.querySelector('[data-item-actions-trigger="101"]');
  const menu = window.document.getElementById("item-actions-menu-101");
  trigger.focus();
  click(trigger);
  assert.equal(menu.hidden, false);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");

  window.document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(menu.hidden, true);
  assert.equal(window.document.activeElement, trigger);

  click(trigger);
  click(window.document.querySelector('[data-item-edit-open="101"]'));
  assert.equal(menu.hidden, true);
  window.document.getElementById("item-edit-form").outerHTML = editFormHtml();
  emit("htmx:afterSwap", { target: window.document.getElementById("item-edit-form") });

  const dialog = window.document.getElementById("item-edit-dialog");
  assert.equal(dialog.open, true);
  assert.equal(window.document.activeElement.id, "item-edit-title");

  const posterInput = window.document.getElementById("item-edit-poster");
  const previewWrap = dialog.querySelector("[data-poster-preview-wrap]");
  const previewImg = dialog.querySelector("[data-poster-preview]");
  assert.equal(previewImg.getAttribute("referrerpolicy"), "no-referrer");

  posterInput.value = "/replacement.jpg";
  posterInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(previewWrap.hidden, false);
  assert.equal(previewImg.getAttribute("src"), "https://image.tmdb.org/t/p/w500/replacement.jpg");

  posterInput.value = "http://insecure.example/poster.jpg";
  posterInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(previewWrap.hidden, true);
  assert.equal(previewImg.hasAttribute("src"), false);

  posterInput.value = "https://images.example/safe.jpg";
  posterInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(previewWrap.hidden, false);
  assert.equal(previewImg.getAttribute("src"), "https://images.example/safe.jpg");

  click(dialog.querySelector("[data-clear-release-date]"));
  assert.equal(window.document.getElementById("item-edit-release-date").value, "");
  assert.equal(dialog.querySelector("[data-clear-release-date]").hidden, true);

  click(dialog.querySelector(".dialog-footer [data-item-edit-dialog-close]"));
  assert.equal(dialog.open, false);
  assert.equal(window.document.activeElement, trigger);
  dom.window.close();
});

test("in-flight lock blocks dismissal and transport failure retains drafts with role=alert", () => {
  const { dom, window, click, emit } = openStandalone(detailHtml(itemRow(101, "Movie")));
  click(window.document.querySelector('[data-item-actions-trigger="101"]'));
  click(window.document.querySelector('[data-item-edit-open="101"]'));
  window.document.getElementById("item-edit-form").outerHTML = editFormHtml();
  const form = window.document.getElementById("item-edit-form");
  emit("htmx:afterSwap", { target: form });

  const dialog = window.document.getElementById("item-edit-dialog");
  window.document.getElementById("item-edit-title").value = "Unsaved Draft";
  emit("htmx:beforeRequest", { elt: form });
  assert.equal(dialog.getAttribute("aria-busy"), "true");
  const cancel = new window.Event("cancel", { bubbles: true, cancelable: true });
  dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  click(dialog.querySelector(".dialog-close"));
  assert.equal(dialog.open, true);

  emit("htmx:responseError", { elt: form });
  emit("htmx:afterRequest", { elt: form, successful: false });
  assert.equal(dialog.hasAttribute("aria-busy"), false);
  assert.equal(dialog.open, true);
  assert.equal(window.document.getElementById("item-edit-title").value, "Unsaved Draft");
  assert.equal(
    window.document.getElementById("item-edit-form-error").textContent,
    "Failed to save changes. Please try again.",
  );
  dom.window.close();
});

function createEditServer(refreshedRows, query) {
  return http.createServer((request, response) => {
    if (request.url.endsWith("/edit")) {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(editFormHtml());
      return;
    }
    if (request.method === "POST") {
      response.writeHead(204, {
        "HX-Trigger": JSON.stringify({
          "watchlist-item-saved": {
            watchlistId: 41,
            watchlistItemId: 101,
            message: "Changes saved successfully",
          },
        }),
      });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(detailHtml(refreshedRows, query));
  });
}

async function runHtmxEdit({ refreshedRows, query, expectedFocusId }) {
  const server = createEditServer(refreshedRows, query);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dom = new JSDOM(detailHtml(itemRow(101, "Movie"), query), {
    url: `http://127.0.0.1:${server.address().port}/v2/watchlists/41?query=${query}`,
    runScripts: "outside-only",
  });
  try {
    const { window } = dom;
    patchDom(window);
    window.eval(fs.readFileSync(path.join(root, "static/vendor/htmx.min.js"), "utf8"));
    installItemEditModules(window);
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    const formSettled = new Promise((resolve) =>
      window.document.addEventListener("htmx:afterSettle", resolve, { once: true }),
    );
    window.document.querySelector('[data-item-actions-trigger="101"]').click();
    window.document.querySelector('[data-item-edit-open="101"]').click();
    await formSettled;
    assert.equal(window.document.getElementById("item-edit-dialog").open, true);

    const refreshSettled = new Promise((resolve) => {
      const listener = (event) => {
        if (event.detail.target.matches(".watchlist")) {
          window.document.removeEventListener("htmx:afterSettle", listener);
          resolve();
        }
      };
      window.document.addEventListener("htmx:afterSettle", listener);
    });
    window.document
      .getElementById("item-edit-form")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await refreshSettled;
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    assert.equal(window.document.getElementById("item-edit-dialog").open, false);
    const active = window.document.activeElement;
    assert.equal(active.getAttribute("data-item-actions-trigger") || active.id, expectedFocusId);
  } finally {
    dom.window.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("real HTMX save reconciles detail view and restores focus to edited row trigger", () =>
  runHtmxEdit({ refreshedRows: itemRow(101, "Edited Movie"), query: "", expectedFocusId: "101" }));

test("real HTMX save falls back to search input when edited row moves out of active filter", () =>
  runHtmxEdit({
    refreshedRows: '<p role="status">No items match these filters.</p>',
    query: "Movie",
    expectedFocusId: "query",
  }));
