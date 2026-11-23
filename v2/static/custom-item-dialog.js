const DEFAULT_MEDIA_TYPE = "movie";

class CustomItemDialog {
  pendingRequests = new Set();
  returnFocus = null;
  notificationTimeout = 0;
  pressedOutside = false;
  formElement = null;
  titleElement = null;
  typeElement = null;
  yearElement = null;
  insertionElement = null;
  errorElement = null;
  closeElements = [];

  constructor(dialogElement) {
    this.dialogElement = dialogElement;
    this.notificationElement = document.getElementById("notification");
    this.bindFormElements();
  }

  connect() {
    document.addEventListener("click", this.onClick);
    document.addEventListener("watchlist-saved", this.onSaved);
    document.addEventListener("htmx:beforeRequest", this.onRequest);
    document.addEventListener("htmx:afterRequest", this.onRequestDone);
    document.addEventListener("htmx:afterSwap", this.onSwap);
    this.dialogElement.addEventListener("cancel", this.onCancel);
    this.dialogElement.addEventListener("close", this.restoreFocus);
    this.dialogElement.addEventListener("pointerdown", this.onPointerDown);
    this.dialogElement.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pagehide", this.disconnect, { once: true });
  }

  disconnect = () => {
    document.removeEventListener("click", this.onClick);
    document.removeEventListener("watchlist-saved", this.onSaved);
    document.removeEventListener("htmx:beforeRequest", this.onRequest);
    document.removeEventListener("htmx:afterRequest", this.onRequestDone);
    document.removeEventListener("htmx:afterSwap", this.onSwap);
    this.dialogElement.removeEventListener("cancel", this.onCancel);
    this.dialogElement.removeEventListener("close", this.restoreFocus);
    this.dialogElement.removeEventListener("pointerdown", this.onPointerDown);
    this.dialogElement.removeEventListener("pointerup", this.onPointerUp);
    window.clearTimeout(this.notificationTimeout);
    window.removeEventListener("pagehide", this.disconnect);
    this.pendingRequests.clear();
  };

  bindFormElements() {
    this.formElement = this.dialogElement.querySelector("#custom-item-form");
    this.titleElement = this.formElement?.querySelector("#custom-item-title") ?? null;
    this.typeElement = this.formElement?.querySelector("#custom-item-type") ?? null;
    this.yearElement = this.formElement?.querySelector("#custom-item-year") ?? null;
    this.insertionElement = this.formElement?.querySelector("#custom-item-insertion") ?? null;
    this.errorElement = this.formElement?.querySelector("#custom-item-form-error") ?? null;
    this.closeElements = [
      ...this.dialogElement.querySelectorAll("[data-custom-item-dialog-close]"),
    ];
  }

  onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const openElement = target.closest("[data-custom-item-dialog-open]");
    if (openElement) {
      event.preventDefault();
      this.open(openElement);
      return;
    }
    const closeElement = target.closest("[data-custom-item-dialog-close]");
    if (closeElement) {
      event.preventDefault();
      this.close();
    }
  };

  onSaved = (event) => {
    const detail = event.detail;
    if (detail?.mode !== "custom-item") return;
    this.close(true);
    this.showNotification(detail?.message || "Added to watchlist");
  };

  onRequest = (event) => {
    const formElement = this.formFromRequest(event);
    if (!formElement) return;
    const request = event.detail?.xhr || formElement;
    this.pendingRequests.add(request);
    this.setBusy(true);
  };

  onRequestDone = (event) => {
    const formElement = this.formFromRequest(event);
    if (!formElement) return;
    const request = event.detail?.xhr || formElement;
    this.pendingRequests.delete(request);
    this.setBusy(this.pendingRequests.size > 0);
  };

  onSwap = (event) => {
    const target = event.detail?.target;
    if (!target) return;
    if (target.id === "custom-item-form" || this.dialogElement.contains(target)) {
      this.bindFormElements();
      if (this.dialogElement.open) this.focusTitle();
    }
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

  open(triggerElement) {
    if (this.dialogElement.open) return;
    this.bindFormElements();
    this.resetForm();
    this.returnFocus = triggerElement;
    this.dialogElement.showModal();
    this.focusTitle();
  }

  close(force = false) {
    if (!this.dialogElement.open || (!force && this.isBusy())) return;
    this.dialogElement.close();
  }

  resetForm() {
    if (!this.formElement?.isConnected) this.bindFormElements();
    if (!this.formElement) return;
    if (this.titleElement instanceof HTMLInputElement) {
      this.titleElement.value = "";
      this.titleElement.removeAttribute("aria-invalid");
    }
    if (this.typeElement instanceof HTMLSelectElement) {
      this.typeElement.value = DEFAULT_MEDIA_TYPE;
    }
    if (this.yearElement instanceof HTMLInputElement) this.yearElement.value = "";
    if (this.insertionElement instanceof HTMLSelectElement) this.insertionElement.value = "";
    if (this.errorElement) this.errorElement.textContent = "";
  }

  focusTitle() {
    if (!this.titleElement?.isConnected) this.bindFormElements();
    this.titleElement?.focus();
  }

  formFromRequest(event) {
    const element = event.detail?.elt || event.detail?.requestConfig?.elt;
    if (!(element instanceof Element)) return null;
    if (!this.formElement?.isConnected) this.bindFormElements();
    if (!this.formElement) return null;
    return element === this.formElement || this.formElement.contains(element)
      ? this.formElement
      : null;
  }

  setBusy(busy) {
    if (busy) this.dialogElement.setAttribute("aria-busy", "true");
    else this.dialogElement.removeAttribute("aria-busy");
    if (this.closeElements.some((element) => !element.isConnected)) this.bindFormElements();
    this.closeElements.forEach((closeElement) => {
      closeElement.disabled = busy;
    });
  }

  isBusy() {
    return this.dialogElement.getAttribute("aria-busy") === "true";
  }

  isOutside(event) {
    const bounds = this.dialogElement.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  }

  showNotification(message) {
    if (!this.notificationElement) return;
    this.notificationElement.textContent = message;
    this.notificationElement.removeAttribute("hidden");
    window.clearTimeout(this.notificationTimeout);
    this.notificationTimeout = window.setTimeout(() => {
      this.notificationElement.setAttribute("hidden", "");
    }, 4000);
  }
}

const customItemDialogElement = document.getElementById("custom-item-dialog");
if (customItemDialogElement) new CustomItemDialog(customItemDialogElement).connect();
