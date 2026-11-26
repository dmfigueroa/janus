class WatchlistDialog {
  returnFocus = null;
  pendingFocus = null;
  notificationTimeout = 0;

  constructor(dialog) {
    this.dialog = dialog;
  }

  connect() {
    document.addEventListener("click", this.onClick);
    document.addEventListener("watchlist-saved", this.onSaved);
    document.addEventListener("htmx:afterSwap", this.onSwap);
    document.addEventListener("htmx:afterSettle", this.onRefreshSettled);
    this.dialog.addEventListener("cancel", this.onCancel);
    this.dialog.addEventListener("close", this.restoreFocus);
    window.addEventListener("pagehide", this.disconnect, { once: true });
  }

  disconnect = () => {
    document.removeEventListener("click", this.onClick);
    document.removeEventListener("watchlist-saved", this.onSaved);
    document.removeEventListener("htmx:afterSwap", this.onSwap);
    document.removeEventListener("htmx:afterSettle", this.onRefreshSettled);
    this.dialog.removeEventListener("cancel", this.onCancel);
    this.dialog.removeEventListener("close", this.restoreFocus);
    window.clearTimeout(this.notificationTimeout);
    window.removeEventListener("pagehide", this.disconnect);
  };

  onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const opener = target.closest("[data-watchlist-dialog-open]");
    if (opener) {
      event.preventDefault();
      this.open(opener);
    }
  };

  onSaved = (event) => {
    const detail = event.detail;
    this.pendingFocus = {
      mode: detail?.mode || null,
      trigger: this.returnFocus?.dataset.watchlistDialogTrigger || null,
    };
    if (this.dialog.open) this.dialog.close();
    this.showNotification(detail?.message || "Changes saved.");
  };

  onSwap = (event) => {
    const target = event.detail?.target;
    if (!target || !this.dialog.open) return;
    const replacesForm = target.id === "watchlist-form";
    if (replacesForm || this.dialog.contains(target)) {
      this.dialog.querySelector("[autofocus]")?.focus();
    }
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
    if (this.dialog.querySelector(".htmx-request")) event.preventDefault();
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
  }

  resetForm() {
    this.dialog.querySelector("#watchlist-form")?.reset();
    const error = this.dialog.querySelector("#watchlist-form-error");
    if (error) error.textContent = "";
    this.dialog.querySelector("#watchlist-name")?.removeAttribute("aria-invalid");
  }

  isRefreshTarget(target) {
    return target?.id === "watchlist-browse" || target?.matches?.(".watchlist");
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
