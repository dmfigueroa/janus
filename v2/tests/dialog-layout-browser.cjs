const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { launchBrowser } = require("../../tools/playwright-browser.cjs");

const root = path.resolve(__dirname, "..");
const styles = [
  fs.readFileSync(path.join(root, "static/vendor/open-props.min.css"), "utf8"),
  fs.readFileSync(path.join(root, "static/app.css"), "utf8"),
].join("\n");

function pageMarkup() {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>${styles}</style>
      </head>
      <body>
        <main class="watchlist" style="min-height: 240rem"></main>
        <dialog
          id="watchlist-dialog"
          class="dialog"
          aria-labelledby="watchlist-dialog-title"
        >
          <header class="dialog-header">
            <h2 id="watchlist-dialog-title">Edit watchlist</h2>
            <p class="dialog-help">Update your watchlist details.</p>
          </header>
          <button type="button" class="dialog-close" aria-label="Close dialog">Close</button>
          <form class="dialog-form">
            <fieldset class="dialog-fields">
              <div class="form-field">
                <label for="watchlist-name">Name</label>
                <input id="watchlist-name" type="text" value="Marvel Cinematic Universe" />
              </div>
              <div class="form-field">
                <label for="watchlist-description">Description</label>
                <textarea id="watchlist-description">Every MCU film in release order.</textarea>
              </div>
            </fieldset>
            <footer class="dialog-footer">
              <button type="button" class="button-secondary">Cancel</button>
              <button type="submit" class="button-primary">Save changes</button>
            </footer>
          </form>
        </dialog>
      </body>
    </html>`;
}

function dialogBounds(page) {
  return page.locator("#watchlist-dialog").evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
}

const browserNames = (process.env.PLAYWRIGHT_BROWSERS ?? "chromium")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

for (const browserName of browserNames) {
  test(`${browserName}: the dialog stays centered in the viewport after scrolling`, async () => {
    const browser = await launchBrowser(browserName);
    try {
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 390, height: 844 },
      ]) {
        const page = await browser.newPage({ viewport });
        try {
          await page.setContent(pageMarkup(), { waitUntil: "load" });
          await page.evaluate(() => window.scrollTo(0, 700));
          assert.equal(await page.evaluate(() => window.scrollY), 700);
          await page.evaluate(() => document.getElementById("watchlist-dialog").showModal());
          await page.waitForTimeout(250);
          assert.equal(
            await page.evaluate(() => window.scrollY),
            700,
            "opening the dialog must not scroll the document",
          );
          const bounds = await dialogBounds(page);
          assert.ok(bounds.top >= 0, JSON.stringify(bounds));
          assert.ok(bounds.left >= 0, JSON.stringify(bounds));
          assert.ok(bounds.right <= bounds.viewportWidth, JSON.stringify(bounds));
          assert.ok(bounds.bottom <= bounds.viewportHeight, JSON.stringify(bounds));
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  });
}
