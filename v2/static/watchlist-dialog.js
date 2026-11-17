let dialogReturnFocus = null;
let pendingFocus = null;
let notificationTimeout = 0;

function watchlistDialog() {
  return document.getElementById("watchlist-dialog");
}

function focusName(dialog) {
  const input = dialog.querySelector("#watchlist-name");
  if (input) input.focus();
}

function clearFormError(dialog) {
  const error = dialog.querySelector("#watchlist-form-error");
  if (error) error.textContent = "";
}

function resetWatchlistForm(dialog) {
  const form = dialog.querySelector("#watchlist-form");
  if (form) form.reset();
  clearFormError(dialog);
  dialog.querySelector("#watchlist-name")?.removeAttribute("aria-invalid");
}

function showNotification(message) {
  const notification = document.getElementById("notification");
  if (!notification) return;
  notification.textContent = message;
  notification.removeAttribute("hidden");
  window.clearTimeout(notificationTimeout);
  notificationTimeout = window.setTimeout(hideNotification, 4000);
}

function hideNotification() {
  const notification = document.getElementById("notification");
  if (notification) notification.setAttribute("hidden", "");
}

function openWatchlistDialog(trigger) {
  const dialog = watchlistDialog();
  if (!dialog) return;
  if (dialog.open) return;
  resetWatchlistForm(dialog);
  dialogReturnFocus = trigger;
  dialog.showModal();
  focusName(dialog);
}

function dialogIsBusy(dialog) {
  return dialog?.getAttribute("aria-busy") === "true";
}

function dialogIsOpen(dialog) {
  return Boolean(dialog?.open);
}

function dialogCanClose(dialog, force) {
  if (!dialogIsOpen(dialog)) return false;
  return force || !dialogIsBusy(dialog);
}

function closeWatchlistDialog(force = false) {
  const dialog = watchlistDialog();
  if (!dialogCanClose(dialog, force)) return;
  dialog.close();
}

function setCloseControlsDisabled(dialog, disabled) {
  dialog.querySelectorAll("[data-watchlist-dialog-close]").forEach((control) => {
    control.disabled = disabled;
  });
}

function restoreDialogFocus() {
  const trigger = dialogReturnFocus;
  if (trigger?.isConnected) trigger.focus();
  dialogReturnFocus = null;
}

function onDialogClick(event) {
  const target = event.target;
  const opener = target.closest("[data-watchlist-dialog-open]");
  if (opener) {
    event.preventDefault();
    openWatchlistDialog(opener);
    return;
  }
  if (target.closest("[data-watchlist-dialog-close]")) {
    event.preventDefault();
    closeWatchlistDialog();
  }
}

function triggerIdentity() {
  const trigger = dialogReturnFocus;
  if (!trigger) return null;
  return trigger.dataset.watchlistDialogTrigger;
}

function savedMessage(event) {
  const detail = event.detail;
  if (detail && detail.message) return detail.message;
  return "Changes saved.";
}

function savedMode(event) {
  const detail = event.detail;
  if (detail && detail.mode) return detail.mode;
  return null;
}

function onWatchlistSaved(event) {
  pendingFocus = { mode: savedMode(event), trigger: triggerIdentity() };
  closeWatchlistDialog(true);
  showNotification(savedMessage(event));
}

function dialogFromRequest(event) {
  const detail = event.detail;
  if (!detail) return null;
  const element = detail.elt;
  if (!element) return null;
  return element.closest("#watchlist-dialog");
}

function onDialogRequest(event) {
  const dialog = dialogFromRequest(event);
  if (!dialog) return;
  dialog.setAttribute("aria-busy", "true");
  setCloseControlsDisabled(dialog, true);
}

function onDialogRequestDone() {
  document.querySelectorAll("#watchlist-dialog[aria-busy]").forEach((dialog) => {
    dialog.removeAttribute("aria-busy");
    setCloseControlsDisabled(dialog, false);
  });
}

function dialogFromElement(element) {
  if (!element) return null;
  return element.closest("#watchlist-dialog");
}

function dialogForSwapTarget(target) {
  if (!target) return null;
  if (target.id === "watchlist-form") return watchlistDialog();
  return dialogFromElement(target);
}

function onDialogSwap(event) {
  const detail = event.detail;
  if (!detail) return;
  const dialog = dialogForSwapTarget(detail.target);
  if (dialog) focusName(dialog);
}

function targetId(target) {
  return target ? target.id : null;
}

function targetMatchesWatchlist(target) {
  if (!target) return false;
  if (typeof target.matches !== "function") return false;
  return target.matches(".watchlist");
}

function isRefreshTarget(target) {
  return targetId(target) === "watchlist-browse" || targetMatchesWatchlist(target);
}

function settledTarget(event) {
  const detail = event.detail;
  if (!detail) return null;
  return detail.target;
}

function savedFocusSelector({ mode, trigger }) {
  const base = `[data-watchlist-dialog-open="${mode}"]`;
  return trigger ? `${base}[data-watchlist-dialog-trigger="${trigger}"]` : base;
}

function focusSavedTrigger(selector) {
  const trigger = document.querySelector(selector);
  if (trigger) trigger.focus();
}

function onRefreshSettled(event) {
  if (!pendingFocus) return;
  if (!isRefreshTarget(settledTarget(event))) return;
  focusSavedTrigger(savedFocusSelector(pendingFocus));
  pendingFocus = null;
}

function onDialogCancel(event) {
  if (dialogIsBusy(event.currentTarget)) event.preventDefault();
}

function outsideRange(value, minimum, maximum) {
  return value < minimum || value > maximum;
}

function isOutsideDialog(event, dialog) {
  const bounds = dialog.getBoundingClientRect();
  return (
    outsideRange(event.clientX, bounds.left, bounds.right) ||
    outsideRange(event.clientY, bounds.top, bounds.bottom)
  );
}

function installLightDismissFallback(dialog) {
  if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;
  let pressedOutside = false;
  dialog.addEventListener("pointerdown", (event) => {
    pressedOutside = isOutsideDialog(event, dialog);
  });
  dialog.addEventListener("pointerup", (event) => {
    const dismiss = pressedOutside && isOutsideDialog(event, dialog);
    pressedOutside = false;
    if (dismiss) closeWatchlistDialog();
  });
}

const watchlistDialogElement = watchlistDialog();

document.addEventListener("click", onDialogClick);
document.addEventListener("watchlist-saved", onWatchlistSaved);
document.addEventListener("htmx:beforeRequest", onDialogRequest);
document.addEventListener("htmx:afterRequest", onDialogRequestDone);
document.addEventListener("htmx:afterSwap", onDialogSwap);
document.addEventListener("htmx:afterSettle", onRefreshSettled);
if (watchlistDialogElement) {
  watchlistDialogElement.addEventListener("cancel", onDialogCancel);
  watchlistDialogElement.addEventListener("close", restoreDialogFocus);
  installLightDismissFallback(watchlistDialogElement);
}
