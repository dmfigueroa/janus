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
    <dialog id="watchlist-dialog" closedby="any" aria-labelledby="watchlist-dialog-title" data-watchlist-dialog>
      <header><h2 id="watchlist-dialog-title">Create watchlist</h2></header>
      <form id="watchlist-form" hx-post="/v2/watchlists" hx-target="#watchlist-form" hx-swap="outerHTML" hx-disabled-elt="#watchlist-dialog button" hx-indicator="#watchlist-form-pending">
        <label for="watchlist-name">Name</label>
        <input id="watchlist-name" name="name" value="" autofocus />
        <textarea id="watchlist-description" name="description"></textarea>
        <p id="watchlist-form-error" role="alert"></p>
        <span id="watchlist-form-pending" class="htmx-indicator" role="status">Saving…</span>
        <button type="button" commandfor="watchlist-dialog" command="request-close" data-watchlist-dialog-close>Cancel</button>
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
      this.querySelector("[autofocus]")?.focus();
    };
    prototype.close = function close() {
      this.open = false;
      this.removeAttribute("open");
      this.dispatchEvent(new window.Event("close"));
    };
    prototype.requestClose = function requestClose() {
      const cancel = new window.Event("cancel", { cancelable: true });
      if (this.dispatchEvent(cancel)) this.close();
    };
  }
  window.eval(fs.readFileSync(path.join(root, "static/watchlist-dialog.js"), "utf8"));
  const click = (element) =>
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  const emit = (type, detail) =>
    window.document.dispatchEvent(new window.CustomEvent(type, { bubbles: true, detail }));
  return { dom, window, click, emit };
}

test("create dialog opens with native autofocus and restores the trigger on cancel", () => {
  const { dom, window, click } = openPage();
  const opener = window.document.getElementById("opener");
  opener.focus();
  click(opener);
  const dialog = window.document.getElementById("watchlist-dialog");
  assert.equal(dialog.open, true);
  assert.equal(window.document.activeElement.id, "watchlist-name");

  dialog.requestClose();
  assert.equal(dialog.open, false);
  assert.equal(window.document.activeElement.id, "opener");
  dom.window.close();
});

test("saving closes the dialog and announces the v1 success message", () => {
  const { dom, window, click, emit } = openPage();
  const opener = window.document.getElementById("opener");
  opener.focus();
  click(opener);
  window.document.getElementById("watchlist-name").value = "Created locally";
  window.document.getElementById("watchlist-form-pending").classList.add("htmx-request");

  emit("watchlist-saved", { mode: "create", message: "Watchlist created successfully" });
  assert.equal(window.document.getElementById("watchlist-dialog").open, false);
  const notification = window.document.getElementById("notification");
  assert.equal(notification.hasAttribute("hidden"), false);
  assert.equal(notification.textContent, "Watchlist created successfully");
  assert.equal(window.document.activeElement.id, "opener");
  dom.window.close();
});

test("dialog validation swaps refocus the autofocused field", () => {
  const { dom, window, click, emit } = openPage();
  const opener = window.document.getElementById("opener");
  opener.focus();
  click(opener);
  const form = window.document.getElementById("watchlist-form");
  const replacement = form.cloneNode(true);
  replacement.querySelector("#watchlist-form-error").textContent = "Name is required";
  form.replaceWith(replacement);
  emit("htmx:afterSwap", { target: replacement });
  assert.equal(window.document.activeElement.id, "watchlist-name");
  assert.equal(
    window.document.getElementById("watchlist-form-error").textContent,
    "Name is required",
  );
  dom.window.close();
});

test("out-of-band form swaps do not steal focus while the dialog is closed", () => {
  const { dom, window, emit } = openPage();
  const opener = window.document.getElementById("opener");
  opener.focus();
  const form = window.document.getElementById("watchlist-form");
  const replacement = form.cloneNode(true);
  form.replaceWith(replacement);
  emit("htmx:afterSwap", { target: replacement });
  assert.equal(window.document.activeElement.id, "opener");
  dom.window.close();
});

test("in-flight htmx-request blocks cancel requests until completion", () => {
  const { dom, window, click } = openPage();
  const opener = window.document.getElementById("opener");
  opener.focus();
  click(opener);
  const dialog = window.document.getElementById("watchlist-dialog");
  const pending = window.document.getElementById("watchlist-form-pending");

  pending.classList.add("htmx-request");
  dialog.requestClose();
  assert.equal(dialog.open, true);

  pending.classList.remove("htmx-request");
  dialog.requestClose();
  assert.equal(dialog.open, false);
  dom.window.close();
});

test("refreshed results return focus to the control that opened the dialog", () => {
  const { dom, window, click, emit } = openPage();
  const floating = window.document.getElementById("floating");
  floating.focus();
  click(floating);
  emit("watchlist-saved", { mode: "create", message: "Watchlist created successfully" });
  emit("htmx:afterSettle", { target: { id: "watchlist-browse" } });
  assert.equal(window.document.activeElement.id, "floating");
  dom.window.close();
});
