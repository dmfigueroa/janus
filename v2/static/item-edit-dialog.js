import {
  clearReleaseDate,
  closeAllItemMenus,
  expandedWatchedItemIds,
  focusInitialItemField,
  handleItemFieldInput,
  handleMenuEscape,
  pointerOutsideDialog,
  requestElement,
  restoreItemFocus,
  setDialogBusy,
  showFormError,
  showItemNotification,
  syncDialogDescribedBy,
  toggleItemMenu,
} from "@janus/item-edit-fields";

const GENERIC_SAVE_ERROR = "Failed to save changes. Please try again.";

class ItemEditDialog {
  pendingRequests = new Set();
  returnFocus = null;
  pendingFocus = null;
  openingItem = false;
  activeOpenRequest = null;
  pressedOutside = false;
  notificationTimeout = 0;

  constructor(dialog) {
    this.dialog = dialog;
    this.documentEvents = [
      ["click", this.onClick],
      ["keydown", this.onKeydown],
      ["input", this.onInput],
      ["watchlist-item-saved", this.onSaved],
      ["htmx:beforeRequest", this.onRequest],
      ["htmx:beforeSwap", this.onBeforeSwap],
      ["htmx:afterRequest", this.onRequestDone],
      ["htmx:afterSwap", this.onSwap],
      ["htmx:afterSettle", this.onRefreshSettled],
      ["htmx:responseError", this.onTransportError],
      ["htmx:sendError", this.onTransportError],
      ["htmx:abort", this.onAbort],
    ];
    this.dialogEvents = [
      ["cancel", this.onCancel],
      ["close", this.restoreFocus],
      ["pointerdown", this.onPointerDown],
      ["pointerup", this.onPointerUp],
    ];
  }

  connect() {
    this.documentEvents.forEach(([type, listener]) => document.addEventListener(type, listener));
    this.dialogEvents.forEach(([type, listener]) => this.dialog.addEventListener(type, listener));
    window.addEventListener("pagehide", this.disconnect, { once: true });
  }

  disconnect = () => {
    this.documentEvents.forEach(([type, listener]) => document.removeEventListener(type, listener));
    this.dialogEvents.forEach(([type, listener]) =>
      this.dialog.removeEventListener(type, listener),
    );
    window.clearTimeout(this.notificationTimeout);
    window.removeEventListener("pagehide", this.disconnect);
    this.pendingRequests.clear();
  };

  onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const menuTrigger = target.closest("[data-item-actions-trigger]");
    if (menuTrigger) {
      if (!menuTrigger.disabled) {
        event.preventDefault();
        toggleItemMenu(menuTrigger);
      }
      return;
    }
    const editOpener = target.closest("[data-item-edit-open]");
    if (editOpener) {
      this.returnFocus =
        editOpener.closest("[data-item-actions]")?.querySelector("[data-item-actions-trigger]") ||
        null;
      closeAllItemMenus();
      this.openingItem = true;
      this.activeOpenRequest = null;
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

  onKeydown = (event) => handleMenuEscape(this.dialog, event);

  onInput = (event) => handleItemFieldInput(this.dialog, event);

  onSaved = (event) => {
    const detail = event.detail;
    this.pendingFocus = {
      itemId: detail?.watchlistItemId != null ? String(detail.watchlistItemId) : null,
      expanded: expandedWatchedItemIds(),
    };
    this.close(true);
    this.notificationTimeout = showItemNotification(
      detail?.message || "Changes saved successfully",
      this.notificationTimeout,
    );
  };

  onRequest = (event) => {
    const opener = this.openerFromRequest(event);
    if (opener) {
      this.activeOpenRequest = event.detail?.xhr || opener;
      return;
    }
    const form = this.formFromRequest(event);
    if (!form) return;
    this.pendingRequests.add(event.detail?.xhr || form);
    setDialogBusy(this.dialog, true);
  };

  onBeforeSwap = (event) => {
    const opener = this.openerFromRequest(event);
    if (!opener) return;
    const token = event.detail?.xhr || opener;
    if (this.openingItem && (!this.activeOpenRequest || this.activeOpenRequest === token)) return;
    if (event.detail) event.detail.shouldSwap = false;
    event.preventDefault();
  };

  onRequestDone = (event) => {
    const form = this.formFromRequest(event);
    if (!form) return;
    this.pendingRequests.delete(event.detail?.xhr || form);
    setDialogBusy(this.dialog, this.pendingRequests.size > 0);
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
    if (form && this.dialog.open) showFormError(this.dialog, form, GENERIC_SAVE_ERROR);
  };

  onSwap = (event) => {
    const target = event.detail?.target;
    if (!(target instanceof Element)) return;
    if (target.id !== "item-edit-form" && !this.dialog.contains(target)) return;
    if (this.openingItem && !this.dialog.open) {
      this.openingItem = false;
      this.activeOpenRequest = null;
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
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      this.pressedOutside = pointerOutsideDialog(this.dialog, event);
    }
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
    if (this.dialog.open && (force || !this.isBusy())) this.dialog.close();
  }

  openerFromRequest = (event) => requestElement(event)?.closest("[data-item-edit-open]") || null;

  formFromRequest = (event) => requestElement(event)?.closest("#item-edit-form") || null;

  isBusy = () => this.dialog.getAttribute("aria-busy") === "true";
}

const itemEditDialogElement = document.getElementById("item-edit-dialog");
if (itemEditDialogElement) new ItemEditDialog(itemEditDialogElement).connect();
