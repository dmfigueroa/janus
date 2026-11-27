let returnFocus = null;

function searchDialog() {
  const dialog = document.querySelector("#search-dialog");
  return dialog instanceof HTMLDialogElement ? dialog : null;
}

function bindDialog(dialog) {
  if (dialog.dataset.searchBound === "true") return;
  dialog.dataset.searchBound = "true";
  dialog.addEventListener("close", onClose);
  dialog.addEventListener("cancel", onCancel);
}

function syncInsertion(dialog) {
  const select = dialog.querySelector("#search-watchlist");
  const fieldset = dialog.querySelector("#search-insertion");
  if (!(select instanceof HTMLSelectElement) || !(fieldset instanceof HTMLFieldSetElement)) return;
  const custom = select.selectedOptions[0]?.dataset.order === "custom";
  fieldset.dataset.custom = custom ? "true" : "false";
  fieldset.hidden = !custom;
  fieldset.disabled = !custom;
  if (custom) return;
  const beginning = fieldset.querySelector("input[value='beginning']");
  const end = fieldset.querySelector("input[value='end']");
  if (beginning instanceof HTMLInputElement) beginning.checked = false;
  if (end instanceof HTMLInputElement) end.checked = false;
}

function onSwap(event) {
  const target = event.detail?.target;
  if (!(target instanceof Element) || target.id !== "search-dialog") return;
  const dialog = searchDialog();
  if (!dialog) return;
  bindDialog(dialog);
  if (!dialog.open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
  }
  syncInsertion(dialog);
  const focus = dialog.querySelector("[autofocus]");
  if (focus instanceof HTMLElement) focus.focus();
}

function onChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || target.id !== "search-watchlist") return;
  const dialog = searchDialog();
  if (dialog) syncInsertion(dialog);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function onAdded(event) {
  const dialog = searchDialog();
  if (dialog?.open) dialog.close();
  const notification = document.querySelector("#notification");
  if (!(notification instanceof HTMLElement)) return;
  const message = event.detail?.message;
  notification.textContent =
    typeof message === "string" && message.length > 0 ? message : "Added to watchlist";
  notification.hidden = false;
  if (prefersReducedMotion() || typeof notification.animate !== "function") return;
  notification.animate(
    [
      { opacity: 0, transform: "translateY(100%)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    {
      duration: 200,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      fill: "both",
    },
  );
}

function onClose() {
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

function onCancel(event) {
  const dialog = event.currentTarget;
  if (dialog instanceof HTMLDialogElement && dialog.querySelector(".htmx-request")) {
    event.preventDefault();
  }
}

const listener = new AbortController();
document.addEventListener("htmx:afterSwap", onSwap, { signal: listener.signal });
document.addEventListener("change", onChange, { signal: listener.signal });
document.addEventListener("search-added", onAdded, { signal: listener.signal });
window.addEventListener(
  "pagehide",
  () => {
    listener.abort();
  },
  { once: true },
);
