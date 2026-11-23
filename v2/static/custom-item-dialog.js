const DIALOG_ID = "custom-item-dialog";
const FORM_ID = "custom-item-form";
const FORM_SELECTOR = `#${FORM_ID}`;
const TITLE_SELECTOR = "#custom-item-title";
const TYPE_SELECTOR = "#custom-item-type";
const YEAR_SELECTOR = "#custom-item-year";
const INSERTION_SELECTOR = "#custom-item-insertion";
const ERROR_SELECTOR = "#custom-item-form-error";
const OPEN_SELECTOR = "[data-custom-item-dialog-open]";
const CLOSE_SELECTOR = "[data-custom-item-dialog-close]";
const DEFAULT_MEDIA_TYPE = "movie";

class CustomItemDialog {
  pendingRequests = new Set();
  returnFocus = null;
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
    if (target.closest(OPEN_SELECTOR)) {
      event.preventDefault();
      this.open(target.closest(OPEN_SELECTOR));
      return;
    }
    if (target.closest(CLOSE_SELECTOR)) {
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
    if (!target || !this.dialog.open) return;
    if (target.id === FORM_ID || this.dialog.contains(target)) {
      this.focusTitle();
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

  open(trigger) {
    if (this.dialog.open) return;
    this.resetForm();
    this.returnFocus = trigger;
    this.dialog.showModal();
    this.focusTitle();
  }

  close(force = false) {
    if (!this.dialog.open || (!force && this.isBusy())) return;
    this.dialog.close();
  }

  resetForm() {
    const form = this.dialog.querySelector(FORM_SELECTOR);
    if (!form) return;
    const title = form.querySelector(TITLE_SELECTOR);
    if (title instanceof HTMLInputElement) {
      title.value = "";
      title.removeAttribute("aria-invalid");
    }
    const mediaType = form.querySelector(TYPE_SELECTOR);
    if (mediaType instanceof HTMLSelectElement) mediaType.value = DEFAULT_MEDIA_TYPE;
    const year = form.querySelector(YEAR_SELECTOR);
    if (year instanceof HTMLInputElement) year.value = "";
    const insertion = form.querySelector(INSERTION_SELECTOR);
    if (insertion instanceof HTMLSelectElement) insertion.value = "";
    const error = form.querySelector(ERROR_SELECTOR);
    if (error) error.textContent = "";
  }

  focusTitle() {
    this.dialog.querySelector(TITLE_SELECTOR)?.focus();
  }

  formFromRequest(event) {
    const element = event.detail?.elt || event.detail?.requestConfig?.elt;
    return element instanceof Element ? element.closest(FORM_SELECTOR) : null;
  }

  setBusy(busy) {
    if (busy) this.dialog.setAttribute("aria-busy", "true");
    else this.dialog.removeAttribute("aria-busy");
    this.dialog.querySelectorAll(CLOSE_SELECTOR).forEach((control) => {
      control.disabled = busy;
    });
  }

  isBusy() {
    return this.dialog.getAttribute("aria-busy") === "true";
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

const customItemDialogElement = document.getElementById(DIALOG_ID);
if (customItemDialogElement) new CustomItemDialog(customItemDialogElement).connect();
