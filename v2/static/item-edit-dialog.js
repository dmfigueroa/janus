import {
  clearReleaseDate,
  closeAllItemMenus,
  expandedWatchedItemIds,
  focusInitialItemField,
  pointerOutsideDialog,
  restoreItemFocus,
  setDialogBusy,
  syncClearDateButton,
  syncDialogDescribedBy,
  syncPosterPreview,
  toggleItemMenu,
} from "@janus/item-edit-fields";

const GENERIC_SAVE_ERROR = "Failed to save changes. Please try again.";

class ItemEditDialog {
  pendingRequests = new Set();
  returnFocus = null;
  pendingFocus = null;
  openingItem = false;
  pressedOutside = false;
  notificationTimeout = 0;

  constructor(dialog) {
    this.dialog = dialog;
  }

  connect() {
    document.addEventListener("click", this.onClick);
    document.addEventListener("keydown", this.onKeydown);
    document.addEventListener("input", this.onInput);
    document.addEventListener("watchlist-item-saved", this.onSaved);
    document.addEventListener("htmx:beforeRequest", this.onRequest);
    document.addEventListener("htmx:afterRequest", this.onRequestDone);
    document.addEventListener("htmx:afterSwap", this.onSwap);
    document.addEventListener("htmx:afterSettle", this.onRefreshSettled);
    document.addEventListener("htmx:responseError", this.onTransportError);
    document.addEventListener("htmx:sendError", this.onTransportError);
    this.dialog.addEventListener("cancel", this.onCancel);
    this.dialog.addEventListener("close", this.restoreFocus);
    this.dialog.addEventListener("pointerdown", this.onPointerDown);
    this.dialog.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pagehide", this.disconnect, { once: true });
  }

  disconnect = () => {
    document.removeEventListener("click", this.onClick);
    document.removeEventListener("keydown", this.onKeydown);
    document.removeEventListener("input", this.onInput);
    document.removeEventListener("watchlist-item-saved", this.onSaved);
    document.removeEventListener("htmx:beforeRequest", this.onRequest);
    document.removeEventListener("htmx:afterRequest", this.onRequestDone);
    document.removeEventListener("htmx:afterSwap", this.onSwap);
    document.removeEventListener("htmx:afterSettle", this.onRefreshSettled);
    document.removeEventListener("htmx:responseError", this.onTransportError);
    document.removeEventListener("htmx:sendError", this.onTransportError);
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
    const menuTrigger = target.closest("[data-item-actions-trigger]");
    if (menuTrigger) {
      if (menuTrigger.disabled) return;
      event.preventDefault();
      toggleItemMenu(menuTrigger);
      return;
    }
    const editOpener = target.closest("[data-item-edit-open]");
    if (editOpener) {
      const container = editOpener.closest("[data-item-actions]");
      this.returnFocus = container?.querySelector("[data-item-actions-trigger]") || null;
      closeAllItemMenus();
      this.openingItem = true;
      return;
    }
    if (target.closest("[data-clear-release-date]")) {
      event.preventDefault();
      clearReleaseDate(this.dialog);
      return;
    }
    if (target.closest("[data-item-edit-dialog-close]")) {
      event.preventDefault();
      this.close();
      return;
    }
    if (!target.closest(".item-actions-menu")) closeAllItemMenus();
  };

  onKeydown = (event) => {
    if (event.key !== "Escape" || this.dialog.open) return;
    const openTrigger = document.querySelector('[data-item-actions-trigger][aria-expanded="true"]');
    if (!openTrigger) return;
    closeAllItemMenus();
    openTrigger.focus();
  };

  onInput = (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !this.dialog.contains(target)) return;
    if (target.id === "item-edit-poster") syncPosterPreview(this.dialog, target.value);
    if (target.id === "item-edit-release-date") syncClearDateButton(this.dialog, target.value);
  };

  onSaved = (event) => {
    const detail = event.detail;
    this.pendingFocus = {
      itemId: detail?.watchlistItemId != null ? String(detail.watchlistItemId) : null,
      expanded: expandedWatchedItemIds(),
    };
    this.close(true);
    this.showNotification(detail?.message || "Changes saved successfully");
  };

  onRequest = (event) => {
    const form = this.formFromRequest(event);
    if (!form) return;
    this.pendingRequests.add(event.detail?.xhr || form);
    setDialogBusy(this.dialog, true);
  };

  onRequestDone = (event) => {
    const form = this.formFromRequest(event);
    if (!form) return;
    this.pendingRequests.delete(event.detail?.xhr || form);
    setDialogBusy(this.dialog, this.pendingRequests.size > 0);
  };

  onTransportError = (event) => {
    const element = event.detail?.elt || event.detail?.requestConfig?.elt;
    if (element instanceof Element && element.closest("[data-item-edit-open]")) {
      this.openingItem = false;
      return;
    }
    const form = this.formFromRequest(event);
    if (!form || !this.dialog.open) return;
    const error = form.querySelector("#item-edit-form-error");
    if (error) error.textContent = GENERIC_SAVE_ERROR;
    syncDialogDescribedBy(this.dialog);
  };

  onSwap = (event) => {
    const target = event.detail?.target;
    if (!(target instanceof Element)) return;
    if (target.id !== "item-edit-form" && !this.dialog.contains(target)) return;
    if (this.openingItem && !this.dialog.open) {
      this.openingItem = false;
      this.dialog.showModal();
    }
    if (!this.dialog.open) return;
    syncDialogDescribedBy(this.dialog);
    focusInitialItemField(this.dialog);
  };

  onRefreshSettled = (event) => {
    if (!this.pendingFocus || !event.detail?.target?.matches?.(".watchlist")) return;
    const { itemId, expanded } = this.pendingFocus;
    this.pendingFocus = null;
    restoreItemFocus(itemId, expanded);
  };

  onCancel = (event) => {
    if (this.isBusy()) event.preventDefault();
  };

  onPointerDown = (event) => {
    if ("closedBy" in HTMLDialogElement.prototype) return;
    this.pressedOutside = pointerOutsideDialog(this.dialog, event);
  };

  onPointerUp = (event) => {
    if ("closedBy" in HTMLDialogElement.prototype) return;
    const dismiss = this.pressedOutside && pointerOutsideDialog(this.dialog, event);
    this.pressedOutside = false;
    if (dismiss) this.close();
  };

  restoreFocus = () => {
    if (!this.pendingFocus && this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
  };

  close(force = false) {
    if (!this.dialog.open || (!force && this.isBusy())) return;
    this.dialog.close();
  }

  formFromRequest(event) {
    const element = event.detail?.elt || event.detail?.requestConfig?.elt;
    return element instanceof Element ? element.closest("#item-edit-form") : null;
  }

  isBusy() {
    return this.dialog.getAttribute("aria-busy") === "true";
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

const itemEditDialogElement = document.getElementById("item-edit-dialog");
if (itemEditDialogElement) new ItemEditDialog(itemEditDialogElement).connect();
