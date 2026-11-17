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
  return `<watchlist-reorder class="timeline" hx-post="/reorder?query=first" hx-trigger="reorder" hx-target="this" hx-select=".timeline > *" hx-swap="innerHTML">${rows}</watchlist-reorder>`;
}

function page(itemIds) {
  return `<span id="reorder-recovery" hidden hx-get="" hx-trigger="reconcile" hx-target=".timeline" hx-select=".timeline > *" hx-swap="innerHTML"></span><form><input id="query" value="first" /></form>${timeline(itemIds).replace("</watchlist-reorder>", '<p id="reorder-status" role="status"></p></watchlist-reorder>')}`;
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
  function requestOptions(event) {
    if (event.type === "reorder")
      return { method: "POST", body: event.target.getAttribute("hx-vals") };
  }
  async function respondToTrigger(event) {
    const source = event.target;
    const options = requestOptions(event);
    const detail = { path: source.getAttribute("hx-post") || window.location.href };
    source.dispatchEvent(new window.CustomEvent("htmx:configRequest", { detail, bubbles: true }));
    calls.push({ url: detail.path, options });
    const response = await respond(detail.path, options);
    if (response.ok) {
      const result = new window.DOMParser().parseFromString(await response.text(), "text/html");
      const timeline = window.document.querySelector(".timeline");
      timeline.dispatchEvent(
        new window.CustomEvent("htmx:beforeSwap", {
          detail: { target: timeline, requestConfig: { elt: source } },
          bubbles: true,
          cancelable: true,
        }),
      );
      timeline.replaceChildren(...result.querySelector(".timeline").childNodes);
      timeline.dispatchEvent(
        new window.CustomEvent("htmx:afterSwap", {
          detail: { target: timeline, requestConfig: { elt: source } },
          bubbles: true,
        }),
      );
    }
    source.dispatchEvent(
      new window.CustomEvent("htmx:afterRequest", {
        detail: { successful: response.ok },
        bubbles: true,
      }),
    );
  }
  window.document.addEventListener("reorder", respondToTrigger);
  window.document.addEventListener("reconcile", respondToTrigger);
  window.eval(fs.readFileSync(path.join(root, "static/app.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(root, "static/watchlist-reorder-groups.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(root, "static/watchlist-reorder.js"), "utf8"));
  return { dom, window, calls, scrolled };
}

module.exports = { page, timeline, openReorderPage };
