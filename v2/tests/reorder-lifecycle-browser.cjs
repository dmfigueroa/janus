const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { launchPinnedBrowser } = require("../../tools/playwright-browser.cjs");

const root = path.resolve(__dirname, "..");
let browser;

before(async () => {
  browser = await launchPinnedBrowser("chromium");
});

after(async () => {
  await browser?.close();
});

test("reorder custom element upgrades, rebinds after HTMX swaps and releases detached listeners", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <main id="page">
        <section id="unrelated">Dialog content</section>
        <watchlist-reorder class="timeline" hx-post="/reorder" hx-trigger="reorder" hx-target="this" hx-select=".timeline > *" hx-swap="innerHTML">
          <p id="reorder-status" role="status"></p>
          <article data-item-id="1"><button class="reorder-handle">Move</button></article>
        </watchlist-reorder>
      </main>`);
    await page.addScriptTag({ path: path.join(root, "static/vendor/Sortable.min.js") });
    await page.addScriptTag({ path: path.join(root, "static/watchlist-reorder-groups.js") });
    await page.addScriptTag({ path: path.join(root, "static/watchlist-reorder.js") });

    const upgrade = await page.evaluate(async () => {
      await customElements.whenDefined("watchlist-reorder");
      const timeline = document.querySelector("watchlist-reorder");
      return {
        defined: timeline instanceof customElements.get("watchlist-reorder"),
        shadowRoot: timeline.shadowRoot,
        sortable: Boolean(Sortable.get(timeline)),
      };
    });
    assert.deepEqual(upgrade, { defined: true, shadowRoot: null, sortable: true });

    const replacement = await page.evaluate(() => {
      const timeline = document.querySelector("watchlist-reorder");
      timeline.dispatchEvent(
        new CustomEvent("htmx:beforeSwap", {
          bubbles: true,
          detail: { target: timeline, requestConfig: { elt: timeline } },
        }),
      );
      timeline.innerHTML = `
        <p id="reorder-status" role="status"></p>
        <details open><summary>Watched</summary>
          <article data-item-id="2"><button class="reorder-handle">Move</button></article>
        </details>`;
      timeline.dispatchEvent(
        new CustomEvent("htmx:afterSwap", { bubbles: true, detail: { target: timeline } }),
      );
      return {
        rootSortable: Boolean(Sortable.get(timeline)),
        detailsSortable: Boolean(Sortable.get(timeline.querySelector("details"))),
      };
    });
    assert.deepEqual(replacement, { rootSortable: true, detailsSortable: true });

    const scoped = await page.evaluate(() => {
      const timeline = document.querySelector("watchlist-reorder");
      Sortable.get(timeline).options.onStart();
      const unrelated = new CustomEvent("htmx:beforeSwap", {
        cancelable: true,
        detail: { target: document.querySelector("#unrelated") },
      });
      document.dispatchEvent(unrelated);
      const own = new CustomEvent("htmx:beforeSwap", {
        cancelable: true,
        detail: { target: timeline },
      });
      document.dispatchEvent(own);
      timeline.remove();
      const detached = new CustomEvent("htmx:beforeSwap", {
        cancelable: true,
        detail: { target: document.querySelector("#page") },
      });
      document.dispatchEvent(detached);
      return {
        dragging: timeline.dragging,
        unrelatedBlocked: unrelated.defaultPrevented,
        ownBlocked: own.defaultPrevented,
        detachedBlocked: detached.defaultPrevented,
      };
    });
    assert.deepEqual(scoped, {
      dragging: true,
      unrelatedBlocked: false,
      ownBlocked: true,
      detachedBlocked: false,
    });
  } finally {
    await page.close();
  }
});
