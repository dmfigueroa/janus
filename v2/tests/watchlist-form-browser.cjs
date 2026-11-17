const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function dialogPage() {
  return `
    <a id="opener" href="#" role="button" data-watchlist-dialog-open="create" data-watchlist-dialog-trigger="tile">Create watchlist</a>
    <a id="floating" href="#" role="button" data-watchlist-dialog-open="create" data-watchlist-dialog-trigger="floating">Create watchlist</a>
    <p id="notification" role="status" aria-live="polite" hidden></p>
    <dialog id="watchlist-dialog" aria-labelledby="watchlist-dialog-title" data-watchlist-dialog>
      <header><h2 id="watchlist-dialog-title">Create watchlist</h2></header>
      <form id="watchlist-form" hx-post="/v2/watchlists" hx-target="#watchlist-form" hx-swap="outerHTML">
        <label for="watchlist-name">Name</label>
        <input id="watchlist-name" name="name" value="" />
        <textarea id="watchlist-description" name="description"></textarea>
        <p id="watchlist-form-error" role="alert"></p>
        <button type="button" data-watchlist-dialog-close>Cancel</button>
        <button type="submit">Create watchlist</button>
      </form>
    </dialog>`;
}

function openPage() {
  const dom = new JSDOM(dialogPage(), {
    url: "https://janus.example/v2/watchlists",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const prototype = window.HTMLDialogElement?.prototype;
  if (prototype) {
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
  window.eval(fs.readFileSync(path.join(root, "static/watchlist-dialog.js"), "utf8"));
  return { dom, window };
}

test("create dialog opens with focus on the name and restores the trigger on cancel", () => {
  const { dom, window } = openPage();
  const opener = window.document.getElementById("opener");
  opener.focus();
  opener.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  const dialog = window.document.getElementById("watchlist-dialog");
  assert.equal(dialog.open, true);
  assert.equal(window.document.activeElement.id, "watchlist-name");

  window.document
    .querySelector("[data-watchlist-dialog-close]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(dialog.open, false);
  assert.equal(window.document.activeElement.id, "opener");
  dom.window.close();
});

test("saving closes the dialog and announces the v1 success message", () => {
  const { dom, window } = openPage();
  const opener = window.document.getElementById("opener");
  opener.focus();
  opener.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  window.document.getElementById("watchlist-name").value = "Created locally";
  window.document.getElementById("watchlist-dialog").setAttribute("aria-busy", "true");

  window.document.dispatchEvent(
    new window.CustomEvent("watchlist-saved", {
      bubbles: true,
      detail: { mode: "create", message: "Watchlist created successfully" },
    }),
  );
  assert.equal(window.document.getElementById("watchlist-dialog").open, false);
  const notification = window.document.getElementById("notification");
  assert.equal(notification.hasAttribute("hidden"), false);
  assert.equal(notification.textContent, "Watchlist created successfully");
  assert.equal(window.document.activeElement.id, "opener");
  dom.window.close();
});

test("dialog requests expose pending state and focus replaced validation forms", () => {
  const { dom, window } = openPage();
  const opener = window.document.getElementById("opener");
  opener.focus();
  opener.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  const form = window.document.getElementById("watchlist-form");
  window.document.dispatchEvent(
    new window.CustomEvent("htmx:beforeRequest", {
      bubbles: true,
      detail: { elt: form },
    }),
  );
  const dialog = window.document.getElementById("watchlist-dialog");
  assert.equal(dialog.getAttribute("aria-busy"), "true");
  window.document.dispatchEvent(
    new window.CustomEvent("htmx:afterRequest", {
      bubbles: true,
      detail: { elt: form, successful: false },
    }),
  );
  assert.equal(dialog.hasAttribute("aria-busy"), false);

  const replacement = form.cloneNode(true);
  replacement.querySelector("#watchlist-form-error").textContent = "Name is required";
  form.replaceWith(replacement);
  window.document.dispatchEvent(
    new window.CustomEvent("htmx:afterSwap", {
      bubbles: true,
      detail: { target: replacement },
    }),
  );
  assert.equal(window.document.activeElement.id, "watchlist-name");
  assert.equal(
    window.document.getElementById("watchlist-form-error").textContent,
    "Name is required",
  );
  dom.window.close();
});

test("pending dialogs ignore close controls and cancel requests", () => {
  const { dom, window } = openPage();
  const opener = window.document.getElementById("opener");
  opener.focus();
  opener.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  const dialog = window.document.getElementById("watchlist-dialog");
  const form = window.document.getElementById("watchlist-form");

  window.document.dispatchEvent(
    new window.CustomEvent("htmx:beforeRequest", {
      bubbles: true,
      detail: { elt: form },
    }),
  );
  const cancel = new window.Event("cancel", { bubbles: true, cancelable: true });
  dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  window.document
    .querySelector("[data-watchlist-dialog-close]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(dialog.open, true);

  window.document.dispatchEvent(
    new window.CustomEvent("htmx:afterRequest", {
      bubbles: true,
      detail: { elt: form, successful: false },
    }),
  );
  window.document
    .querySelector("[data-watchlist-dialog-close]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(dialog.open, false);
  dom.window.close();
});

test("light dismiss waits for a press and release outside the dialog", () => {
  const { dom, window } = openPage();
  const opener = window.document.getElementById("opener");
  opener.focus();
  opener.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  const dialog = window.document.getElementById("watchlist-dialog");
  dialog.getBoundingClientRect = () => ({
    left: 100,
    right: 300,
    top: 100,
    bottom: 400,
  });
  const pointer = (type, clientX, clientY) =>
    new window.PointerEvent(type, { bubbles: true, clientX, clientY });

  dialog.dispatchEvent(pointer("pointerdown", 20, 20));
  dialog.dispatchEvent(pointer("pointerup", 200, 200));
  assert.equal(dialog.open, true);

  dialog.dispatchEvent(pointer("pointerdown", 20, 20));
  dialog.dispatchEvent(pointer("pointerup", 20, 20));
  assert.equal(dialog.open, false);
  assert.equal(window.document.activeElement.id, "opener");
  dom.window.close();
});

test("refreshed results return focus to the control that opened the dialog", () => {
  const { dom, window } = openPage();
  const floating = window.document.getElementById("floating");
  floating.focus();
  floating.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  window.document.dispatchEvent(
    new window.CustomEvent("watchlist-saved", {
      bubbles: true,
      detail: { mode: "create", message: "Watchlist created successfully" },
    }),
  );
  window.document.dispatchEvent(
    new window.CustomEvent("htmx:afterSettle", {
      bubbles: true,
      detail: { target: { id: "watchlist-browse" } },
    }),
  );
  assert.equal(window.document.activeElement.id, "floating");
  dom.window.close();
});
