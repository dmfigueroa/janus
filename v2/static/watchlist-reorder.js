import { WatchlistReorderGroups } from "@janus/watchlist-reorder-groups";

class WatchlistReorder extends HTMLElement {
  constructor() {
    super();
    this.busy = false;
    this.dragging = false;
    this.state = this.attachInternals?.().states;
    this.onKeydown = (event) => this.handleKeydown(event);
    this.onBeforeRequest = (event) => this.handleBeforeRequest(event);
    this.onBeforeSwap = (event) => this.handleBeforeSwap(event);
    this.onAfterSwap = (event) => this.handleAfterSwap(event);
  }
  connectedCallback() {
    this.addEventListener("keydown", this.onKeydown);
    document.addEventListener("htmx:beforeRequest", this.onBeforeRequest);
    document.addEventListener("htmx:beforeSwap", this.onBeforeSwap);
    document.addEventListener("htmx:afterSwap", this.onAfterSwap);
    this.initializeGroups();
  }
  disconnectedCallback() {
    this.removeEventListener("keydown", this.onKeydown);
    document.removeEventListener("htmx:beforeRequest", this.onBeforeRequest);
    document.removeEventListener("htmx:beforeSwap", this.onBeforeSwap);
    document.removeEventListener("htmx:afterSwap", this.onAfterSwap);
    this.destroyGroups();
  }
  get recovery() {
    return document.getElementById("reorder-recovery");
  }
  handleBeforeRequest(event) {
    const source = event.detail?.elt ?? event.detail?.requestConfig?.elt;
    if (source === this || source === this.recovery) this.pendingXhr = event.detail?.xhr;
  }
  handleBeforeSwap(event) {
    if (!this.swapAffectsTimeline(event)) return;
    if (this.isOwnRequest(event)) {
      this.destroyGroups();
      return;
    }
    if (this.shouldBlockSwap()) event.preventDefault();
  }
  handleAfterSwap(event) {
    if (this.swapAffectsTimeline(event)) this.initializeGroups();
  }
  swapAffectsTimeline(event) {
    const target = event.detail?.target;
    return Boolean(target && (target === this || this.contains(target) || target.contains(this)));
  }
  shouldBlockSwap() {
    return this.dragging || this.busy;
  }
  setDragging(dragging) {
    this.dragging = dragging;
    this.querySelectorAll("[data-item-actions-trigger]").forEach((trigger) => {
      trigger.disabled = dragging || this.busy;
    });
    if (dragging) {
      this.querySelectorAll(".item-actions-menu").forEach((menu) => {
        menu.hidePopover?.();
      });
    }
  }
  isOwnRequest(event) {
    const source =
      event.detail?.requestConfig?.elt ??
      (event.detail?.xhr && event.detail.xhr === this.pendingXhr ? this.pendingSource : null);
    return (
      Boolean(source) && [this, this.recovery].includes(source) && event.detail?.target === this
    );
  }
  announce(message) {
    const status = this.querySelector("#reorder-status");
    if (status) status.textContent = message;
  }
  rows() {
    return [...this.querySelectorAll("article[data-item-id]")];
  }
  visible() {
    return this.rows().filter((row) => row.getClientRects().length);
  }
  async save(row, reference, position) {
    if (this.busy || !reference) return;
    await this.performSave(row, reference, position);
  }
  async performSave(row, reference, position) {
    this.busy = true;
    this.state?.add("busy");
    [this, ...this.querySelectorAll("details")].forEach((container) =>
      Sortable.get(container)?.option("disabled", true),
    );
    this.setAttribute("aria-busy", "true");
    this.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    this.announce("Saving order…");
    const expanded = [...this.querySelectorAll("details[open]")].flatMap((group) =>
      [...group.querySelectorAll("article")].map((item) => item.dataset.itemId),
    );
    const activeId = row.dataset.itemId;
    const scroll = window.scrollY;
    try {
      await this.request(this, "reorder", {
        movedItemId: row.dataset.itemId,
        referenceItemId: reference.dataset.itemId,
        position,
      });
    } catch {
      // A failed response may follow a committed write. Re-read without retrying it.
      this.announce("Unable to save order. Restoring current order…");
      try {
        await this.request(this.recovery, "reconcile");
        this.announce("Current order restored. Check the order before trying again.");
      } catch {
        this.announce("Unable to reload order. Refresh before reordering again.");
        return;
      }
    }
    this.restore(expanded, activeId, scroll);
  }
  request(source, trigger, values) {
    if (values) source.setAttribute("hx-vals", JSON.stringify(values));
    this.pendingSource = source;
    return new Promise((resolve, reject) => {
      source.addEventListener(
        "htmx:afterRequest",
        (event) => {
          if (values) source.removeAttribute("hx-vals");
          this.pendingSource = null;
          this.pendingXhr = null;
          if (event.detail.successful) resolve();
          else reject(new Error("Request failed."));
        },
        { once: true },
      );
      source.dispatchEvent(new CustomEvent(trigger, { bubbles: true }));
    });
  }
  restore(expanded, activeId, scroll) {
    this.querySelectorAll("details").forEach((group) => {
      group.open = [...group.querySelectorAll("article")].some(
        (item) => expanded.includes(item.dataset.itemId) || item.dataset.itemId === activeId,
      );
    });
    this.initializeGroups();
    this.querySelector(`[data-item-id="${activeId}"] button`)?.focus({ preventScroll: true });
    window.scrollTo({ top: scroll });
    this.busy = false;
    this.state?.delete("busy");
    [this, ...this.querySelectorAll("details")].forEach((container) =>
      Sortable.get(container)?.option("disabled", false),
    );
    this.removeAttribute("aria-busy");
  }
  dragDuration() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 150;
  }
  initializeGroups() {
    WatchlistReorderGroups.initialize(this);
  }
  destroyGroups() {
    WatchlistReorderGroups.destroy(this);
  }
  saveDrop(row) {
    const order = this.visible();
    const index = order.indexOf(row);
    const reference = order[index - 1] ?? order[index + 1];
    this.save(row, reference, index > 0 ? "after" : "before");
  }
  unchanged(event) {
    return event.from === event.to && event.oldIndex === event.newIndex;
  }
  handleKeydown(event) {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    this.keyboardMove(event);
  }
  keyboardMove(event) {
    const row = event.target.closest("article");
    if (!row || this.busy) return;
    this.moveRow(event, row);
  }
  moveRow(event, row) {
    event.preventDefault();
    const order = this.visible();
    const direction = {
      ArrowUp: { offset: -1, position: "before" },
      ArrowDown: { offset: 1, position: "after" },
    }[event.key];
    const reference = order[order.indexOf(row) + direction.offset];
    if (!reference) return;
    this.placeRow(row, reference, direction.position);
  }
  placeRow(row, reference, position) {
    reference.insertAdjacentElement(position === "before" ? "beforebegin" : "afterend", row);
    this.save(row, reference, position);
  }
}
if (!customElements.get("watchlist-reorder")) {
  customElements.define("watchlist-reorder", WatchlistReorder);
}
