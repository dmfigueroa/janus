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

test("real HTMX submits a form and swaps server HTML without a follow-up GET", async () => {
  const http = require("node:http");
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({ method: request.method, headers: request.headers, body });
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
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    const completed = new Promise((resolve) =>
      window.document.addEventListener("htmx:afterRequest", resolve, { once: true }),
    );
    window.document
      .querySelector("button")
      .dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
      );
    await completed;
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers["hx-request"], "true");
    assert.match(requests[0].headers["content-type"], /application\/x-www-form-urlencoded/);
    assert.equal(new URLSearchParams(requests[0].body).get("movedItemId"), "1");
    assert.equal(window.document.querySelector("article").dataset.itemId, "2");
    assert.equal(window.document.getElementById("reorder-status").textContent, "Order saved.");
    assert.equal(window.document.activeElement.closest("article").dataset.itemId, "1");
    assert.equal(window.document.querySelector(".timeline").hasAttribute("aria-busy"), false);
  } finally {
    dom.window.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
