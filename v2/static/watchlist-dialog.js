class WatchlistDialog {
  pendingRequests = new Set();
  returnFocus = null;
  pendingFocus = null;
  notificationTimeout = 0;
  pressedOutside = false;

  constructor(dialog) {
    this.dialog = dialog;
  }

  connect() {
    document.addEventListener("click", this.onClick);
    document.addEventListener("watchlist-saved", this.onSaved);
    document.addEventListener("htmx:beforeRequest", this.onRequest);
    document.addEventListener("htmx:afterRequest", this.onRequestDone);
    document.addEventListener("htmx:afterSwap", this.onSwap);
    document.addEventListener("htmx:afterSettle", this.onRefreshSettled);
    this.dialog.addEventListener("cancel", this.onCancel);
    this.dialog.addEventListener("close", this.restoreFocus);
    this.dialog.addEventListener("pointerdown", this.onPointerDown);
    this.dialog.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pagehide", this.disconnect, { once: true });
  }

  disconnect = () => {
    document.removeEventListener("click", this.onClick);
    document.removeEventListener("watchlist-saved", this.onSaved);
    document.removeEventListener("htmx:beforeRequest", this.onRequest);
    document.removeEventListener("htmx:afterRequest", this.onRequestDone);
    document.removeEventListener("htmx:afterSwap", this.onSwap);
    document.removeEventListener("htmx:afterSettle", this.onRefreshSettled);
    this.dialog.removeEventListener("cancel", this.onCancel);
    this.dialog.removeEventListener("close", this.restoreFocus);
    this.dialog.removeEventListener("pointerdown", this.onPointerDown);
    this.dialog.removeEventListener("pointerup", this.onPointerUp);
    window.clearTimeout(this.notificationTimeout);
    window.removeEventListener("pagehide", this.disconnect);
    this.pendingRequests.clear();
  };

  onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const opener = target.closest("[data-watchlist-dialog-open]");
    if (opener) {
      event.preventDefault();
      this.open(opener);
      return;
    }
    if (target.closest("[data-watchlist-dialog-close]")) {
      event.preventDefault();
      this.close();
    }
  };

  onSaved = (event) => {
    const detail = event.detail;
    this.pendingFocus = {
      mode: detail?.mode || null,
      trigger: this.returnFocus?.dataset.watchlistDialogTrigger || null,
    };
    this.close(true);
    this.showNotification(detail?.message || "Changes saved.");
  };

  onRequest = (event) => {
    const form = this.formFromRequest(event);
    if (!form) return;
    const request = event.detail?.xhr || form;
    this.pendingRequests.add(request);
    this.setBusy(true);
  };

  onRequestDone = (event) => {
    const form = this.formFromRequest(event);
    if (!form) return;
    const request = event.detail?.xhr || form;
    this.pendingRequests.delete(request);
    this.setBusy(this.pendingRequests.size > 0);
  };

  onSwap = (event) => {
    const target = event.detail?.target;
    if (!target) return;
    const replacesForm = target.id === "watchlist-form";
    if (replacesForm || this.dialog.contains(target)) this.focusName();
  };

  onRefreshSettled = (event) => {
    if (!this.pendingFocus || !this.isRefreshTarget(event.detail?.target)) return;
    const { mode, trigger } = this.pendingFocus;
    const triggerSelector = trigger
      ? `[data-watchlist-dialog-open="${mode}"][data-watchlist-dialog-trigger="${trigger}"]`
      : `[data-watchlist-dialog-open="${mode}"]`;
    document.querySelector(triggerSelector)?.focus();
    this.pendingFocus = null;
  };

  onCancel = (event) => {
    if (this.isBusy()) event.preventDefault();
  };

  onPointerDown = (event) => {
    if ("closedBy" in HTMLDialogElement.prototype) return;
    this.pressedOutside = this.isOutside(event);
  };

  onPointerUp = (event) => {
    if ("closedBy" in HTMLDialogElement.prototype) return;
    const dismiss = this.pressedOutside && this.isOutside(event);
    this.pressedOutside = false;
    if (dismiss) this.close();
  };

  restoreFocus = () => {
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
  };

  open(trigger) {
    if (this.dialog.open) return;
    this.resetForm();
    this.returnFocus = trigger;
    this.dialog.showModal();
    this.focusName();
  }

  close(force = false) {
    if (!this.dialog.open || (!force && this.isBusy())) return;
    this.dialog.close();
  }

  resetForm() {
    this.dialog.querySelector("#watchlist-form")?.reset();
    const error = this.dialog.querySelector("#watchlist-form-error");
    if (error) error.textContent = "";
    this.dialog.querySelector("#watchlist-name")?.removeAttribute("aria-invalid");
  }

  focusName() {
    this.dialog.querySelector("#watchlist-name")?.focus();
  }

  formFromRequest(event) {
    const element = event.detail?.elt || event.detail?.requestConfig?.elt;
    return element instanceof Element ? element.closest("#watchlist-form") : null;
  }

  setBusy(busy) {
    if (busy) this.dialog.setAttribute("aria-busy", "true");
    else this.dialog.removeAttribute("aria-busy");
    this.dialog.querySelectorAll("[data-watchlist-dialog-close]").forEach((control) => {
      control.disabled = busy;
    });
  }

  isBusy() {
    return this.dialog.getAttribute("aria-busy") === "true";
  }

  isRefreshTarget(target) {
    return target?.id === "watchlist-browse" || target?.matches?.(".watchlist");
  }

  isOutside(event) {
    const bounds = this.dialog.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  }

  showNotification(message) {
    const notification = document.getElementById("notification");
    if (!notification) return;
    notification.textContent = message;
    notification.removeAttribute("hidden");
    window.clearTimeout(this.notificationTimeout);
    this.notificationTimeout = window.setTimeout(() => {
      notification.setAttribute("hidden", "");
    }, 4000);
  }
}

const watchlistDialogElement = document.getElementById("watchlist-dialog");
if (watchlistDialogElement) new WatchlistDialog(watchlistDialogElement).connect();
