import {
  clearReleaseDate,
  expandedWatchedItemIds,
  requestElement,
  restoreItemFocus,
  showFormError,
  showItemNotification,
  syncPosterPreview,
} from "@janus/item-edit-fields";

const GENERIC_SAVE_ERROR = "Failed to save changes. Please try again.";

class ItemEditDialog {
  returnFocus = null;
  pendingFocus = null;
  openingItem = false;
  activeOpenRequest = null;
  notificationTimeout = 0;

  constructor(dialog) {
    this.dialog = dialog;
  }

  connect() {
    document.addEventListener("click", this.onClick);
    document.addEventListener("input", this.onInput);
    document.addEventListener("watchlist-item-saved", this.onSaved);
    document.addEventListener("htmx:beforeRequest", this.onRequest);
    document.addEventListener("htmx:beforeSwap", this.onBeforeSwap);
    document.addEventListener("htmx:afterSwap", this.onSwap);
    document.addEventListener("htmx:afterSettle", this.onRefreshSettled);
    document.addEventListener("htmx:responseError", this.onTransportError);
    document.addEventListener("htmx:sendError", this.onTransportError);
    document.addEventListener("htmx:abort", this.onAbort);
    this.dialog.addEventListener("cancel", this.onCancel);
    this.dialog.addEventListener("close", this.restoreFocus);
    window.addEventListener("pagehide", this.disconnect, { once: true });
  }

  disconnect = () => {
    document.removeEventListener("click", this.onClick);
    document.removeEventListener("input", this.onInput);
    document.removeEventListener("watchlist-item-saved", this.onSaved);
    document.removeEventListener("htmx:beforeRequest", this.onRequest);
    document.removeEventListener("htmx:beforeSwap", this.onBeforeSwap);
    document.removeEventListener("htmx:afterSwap", this.onSwap);
    document.removeEventListener("htmx:afterSettle", this.onRefreshSettled);
    document.removeEventListener("htmx:responseError", this.onTransportError);
    document.removeEventListener("htmx:sendError", this.onTransportError);
    document.removeEventListener("htmx:abort", this.onAbort);
    this.dialog.removeEventListener("cancel", this.onCancel);
    this.dialog.removeEventListener("close", this.restoreFocus);
    window.clearTimeout(this.notificationTimeout);
    window.removeEventListener("pagehide", this.disconnect);
  };

  onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const editOpener = target.closest("[data-item-edit-open]");
    if (editOpener) {
      this.returnFocus =
        editOpener.closest("[data-item-actions]")?.querySelector("[data-item-actions-trigger]") ||
        null;
      this.openingItem = true;
      this.activeOpenRequest = null;
      return;
    }
    if (target.closest("[data-clear-release-date]")) {
      event.preventDefault();
      clearReleaseDate(this.dialog);
    }
  };

  onInput = (event) => {
    const target = event.target;
    if (
      target instanceof Element &&
      this.dialog.contains(target) &&
      target.id === "item-edit-poster"
    ) {
      syncPosterPreview(this.dialog, target.value);
    }
  };

  onSaved = (event) => {
    const detail = event.detail;
    this.pendingFocus = {
      itemId: detail?.watchlistItemId != null ? String(detail.watchlistItemId) : null,
      expanded: expandedWatchedItemIds(),
    };
    if (this.dialog.open) this.dialog.close();
    this.notificationTimeout = showItemNotification(
      detail?.message || "Changes saved successfully",
      this.notificationTimeout,
    );
  };

  onRequest = (event) => {
    const opener = this.openerFromRequest(event);
    if (opener) this.activeOpenRequest = event.detail?.xhr || opener;
  };

  onBeforeSwap = (event) => {
    const opener = this.openerFromRequest(event);
    if (!opener) return;
    const token = event.detail?.xhr || opener;
    if (this.openingItem && (!this.activeOpenRequest || this.activeOpenRequest === token)) return;
    if (event.detail) event.detail.shouldSwap = false;
    event.preventDefault();
  };

  onAbort = (event) => {
    const opener = this.openerFromRequest(event);
    if (opener && this.activeOpenRequest === (event.detail?.xhr || opener)) {
      this.openingItem = false;
      this.activeOpenRequest = null;
    }
  };

  onTransportError = (event) => {
    const opener = this.openerFromRequest(event);
    if (opener) {
      const token = event.detail?.xhr || opener;
      if (!this.activeOpenRequest || this.activeOpenRequest === token) {
        this.openingItem = false;
        this.activeOpenRequest = null;
      }
      return;
    }
    const form = this.formFromRequest(event);
    if (form && this.dialog.open) showFormError(form, GENERIC_SAVE_ERROR);
  };

  onSwap = (event) => {
    const target = event.detail?.target;
    if (!(target instanceof Element)) return;
    if (target.id !== "item-edit-form" && !this.dialog.contains(target)) return;
    if (this.openingItem && !this.dialog.open) {
      this.openingItem = false;
      this.activeOpenRequest = null;
      this.dialog.showModal();
      return;
    }
    if (this.dialog.open) this.dialog.querySelector("[autofocus]")?.focus();
  };

  onRefreshSettled = (event) => {
    if (!this.pendingFocus || !event.detail?.target?.matches?.(".watchlist")) return;
    const { itemId, expanded } = this.pendingFocus;
    this.pendingFocus = null;
    restoreItemFocus(itemId, expanded);
  };

  onCancel = (event) => {
    if (this.dialog.querySelector(".htmx-request")) event.preventDefault();
  };

  restoreFocus = () => {
    if (!this.pendingFocus && this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
  };

  openerFromRequest = (event) => requestElement(event)?.closest("[data-item-edit-open]") || null;

  formFromRequest = (event) => requestElement(event)?.closest("#item-edit-form") || null;
}

const itemEditDialogElement = document.getElementById("item-edit-dialog");
if (itemEditDialogElement) new ItemEditDialog(itemEditDialogElement).connect();
