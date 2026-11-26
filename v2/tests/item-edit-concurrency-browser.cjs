const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { installReorderModules } = require("./reorder-browser-fixtures.cjs");

const root = path.resolve(__dirname, "..");

function itemRow(id, title) {
  return `<article data-item-id="${id}"><button type="button" class="reorder-handle">Move</button><div class="item-content"><h3>${title}</h3></div><div class="item-controls"><div class="item-actions" data-item-actions="${id}"><button type="button" class="item-actions-trigger" data-item-actions-trigger="${id}" aria-label="More actions for ${title}" popovertarget="item-actions-menu-${id}">...</button><div id="item-actions-menu-${id}" class="item-actions-menu" popover="auto"><button type="button" class="item-action-button" data-item-edit-open="${id}" popovertarget="item-actions-menu-${id}" popovertargetaction="hide" hx-get="/v2/watchlists/41/items/${id}/edit" hx-target="#item-edit-form" hx-select="#item-edit-form" hx-swap="outerHTML" hx-sync="#item-edit-dialog:replace" hx-vals="unset">Edit</button></div></div></div></article>`;
}

function customOrderPage(rowsHtml) {
  return `<!doctype html><html><head><meta name="htmx-config" content='{"disableInheritance":true}' /></head><body><main class="watchlist"><watchlist-reorder class="timeline" hx-post="/v2/watchlists/41/reorder?query=&unwatched=true" hx-trigger="reorder" hx-target="this" hx-select=".timeline > *" hx-swap="innerHTML" hx-vals='{"movedItemId":"101"}'><p id="reorder-status" role="status"></p>${rowsHtml}</watchlist-reorder></main><dialog id="item-edit-dialog" class="dialog" closedby="any" data-item-edit-dialog><form id="item-edit-form" class="dialog-form"></form></dialog></body></html>`;
}

function editFormHtml(id, title) {
  return `<form id="item-edit-form" class="dialog-form" method="post" action="/v2/watchlists/41/items/${id}" hx-post="/v2/watchlists/41/items/${id}" hx-target="#item-edit-form" hx-swap="outerHTML" data-item-id="${id}"><input id="item-edit-title" name="title" type="text" value="${title}" required autofocus /><p id="item-edit-form-error" role="alert"></p><footer class="dialog-footer"><button type="button" commandfor="item-edit-dialog" command="request-close" data-item-edit-dialog-close>Cancel</button><button type="submit">Save</button></footer></form>`;
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

test("custom-order watchlist-reorder container loads item edit form without inherited hx-select or hx-vals", async () => {
  const seenUrls = [];
  const server = http.createServer((request, response) => {
    seenUrls.push(request.url);
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(editFormHtml(101, "Custom Ordered Movie"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dom = new JSDOM(customOrderPage(itemRow(101, "Custom Ordered Movie")), {
    url: `http://127.0.0.1:${server.address().port}/v2/watchlists/41`,
    runScripts: "outside-only",
  });
  try {
    const { window } = dom;
    patchDom(window);
    window.eval(fs.readFileSync(path.join(root, "static/vendor/Sortable.min.js"), "utf8"));
    window.eval(fs.readFileSync(path.join(root, "static/vendor/htmx.min.js"), "utf8"));
    installReorderModules(window);
    installItemEditModules(window);
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    const settled = new Promise((resolve) =>
      window.document.addEventListener("htmx:afterSettle", resolve, { once: true }),
    );
    window.document.querySelector('[data-item-actions-trigger="101"]').click();
    window.document.querySelector('[data-item-edit-open="101"]').click();
    await settled;

    assert.deepEqual(seenUrls, ["/v2/watchlists/41/items/101/edit"]);
    assert.equal(window.document.getElementById("item-edit-dialog").open, true);
    assert.equal(window.document.getElementById("item-edit-title").value, "Custom Ordered Movie");
  } finally {
    dom.window.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("rapid Edit clicks replace prior in-flight GET and prevent stale responses from overwriting the open editor", async () => {
  let releaseFirst;
  const firstResponseReady = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const server = http.createServer(async (request, response) => {
    if (request.url.endsWith("/101/edit")) {
      await firstResponseReady;
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(editFormHtml(101, "Item A"));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(editFormHtml(102, "Item B"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dom = new JSDOM(customOrderPage(`${itemRow(101, "Item A")}${itemRow(102, "Item B")}`), {
    url: `http://127.0.0.1:${server.address().port}/v2/watchlists/41`,
    runScripts: "outside-only",
  });
  try {
    const { window } = dom;
    patchDom(window);
    window.eval(fs.readFileSync(path.join(root, "static/vendor/Sortable.min.js"), "utf8"));
    window.eval(fs.readFileSync(path.join(root, "static/vendor/htmx.min.js"), "utf8"));
    installReorderModules(window);
    installItemEditModules(window);
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    window.document.querySelector('[data-item-actions-trigger="101"]').click();
    window.document.querySelector('[data-item-edit-open="101"]').click();
    await new Promise((resolve) => window.setTimeout(resolve, 15));

    const secondSettled = new Promise((resolve) =>
      window.document.addEventListener("htmx:afterSettle", resolve, { once: true }),
    );
    window.document.querySelector('[data-item-actions-trigger="102"]').click();
    window.document.querySelector('[data-item-edit-open="102"]').click();
    await secondSettled;

    assert.equal(window.document.getElementById("item-edit-dialog").open, true);
    assert.equal(window.document.getElementById("item-edit-form").dataset.itemId, "102");
    window.document.getElementById("item-edit-title").value = "Item B Draft";

    releaseFirst();
    await new Promise((resolve) => window.setTimeout(resolve, 40));

    assert.equal(window.document.getElementById("item-edit-form").dataset.itemId, "102");
    assert.equal(window.document.getElementById("item-edit-title").value, "Item B Draft");

    const staleSwap = new window.CustomEvent("htmx:beforeSwap", {
      cancelable: true,
      detail: {
        elt: window.document.querySelector('[data-item-edit-open="101"]'),
        xhr: { id: "stale" },
        shouldSwap: true,
      },
    });
    window.document.dispatchEvent(staleSwap);
    assert.equal(staleSwap.defaultPrevented, true);
    assert.equal(staleSwap.detail.shouldSwap, false);
  } finally {
    releaseFirst();
    dom.window.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
