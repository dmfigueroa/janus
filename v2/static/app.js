document.addEventListener("htmx:responseError", () => {
  document.getElementById("request-error")?.removeAttribute("hidden");
});
document.addEventListener("htmx:sendError", () => {
  document.getElementById("request-error")?.removeAttribute("hidden");
});

function initializeReorder() {
  const timeline = document.querySelector('[data-reorder-url][data-mode="custom"]');
  if (!timeline || timeline.dataset.initialized) return;
  timeline.dataset.initialized = "true";
  new WatchlistReorder(timeline);
}
class WatchlistReorder {
  constructor(timeline) {
    this.timeline = timeline;
    this.busy = false;
    this.dragging = false;
    this.initializeGroups();
    this.timeline.addEventListener("keydown", (event) => this.onKeydown(event));
    document.addEventListener("htmx:beforeSwap", (event) => {
      if (this.shouldBlockSwap(event)) event.preventDefault();
    });
  }
  shouldBlockSwap(event) {
    if (this.dragging) return true;
    return this.busy && !this.isOwnRequest(event);
  }
  isOwnRequest(event) {
    return event.detail?.requestConfig?.elt === this.timeline;
  }
  announce(message) {
    const status = document.getElementById("reorder-status");
    if (status) status.textContent = message;
  }
  rows() {
    return [...this.timeline.querySelectorAll("article[data-item-id]")];
  }
  visible() {
    return this.rows().filter((row) => row.getClientRects().length);
  }
  async save(row, reference, position) {
    if (this.busy) return;
    if (!reference) return;
    await this.performSave(row, reference, position);
  }
  async performSave(row, reference, position) {
    this.busy = true;
    [this.timeline, ...this.timeline.querySelectorAll("details")].forEach((container) =>
      Sortable.get(container)?.option("disabled", true),
    );
    this.timeline.setAttribute("aria-busy", "true");
    this.timeline.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    this.announce("Saving order…");
    const expanded = [...this.timeline.querySelectorAll("details[open]")].flatMap((group) =>
      [...group.querySelectorAll("article")].map((item) => item.dataset.itemId),
    );
    const activeId = row.dataset.itemId;
    const scroll = window.scrollY;
    const url = new URL(this.timeline.dataset.reorderUrl, location.href);
    url.search = location.search;
    try {
      await this.request("POST", url.href, {
        movedItemId: row.dataset.itemId,
        referenceItemId: reference.dataset.itemId,
        position,
      });
    } catch {
      // A failed response may follow a committed write. Re-read without retrying it.
      this.announce("Unable to save order. Restoring current order…");
      try {
        await this.request("GET", location.href);
        this.announce("Current order restored. Check the order before trying again.");
      } catch {
        this.announce("Unable to reload order. Refresh before reordering again.");
        return;
      }
    }
    this.restore(expanded, activeId, scroll);
  }
  async request(method, url, values) {
    let failed = false;
    const checkResponse = (event) => {
      failed = event.detail.xhr.status >= 400;
    };
    this.timeline.addEventListener("htmx:afterRequest", checkResponse);
    try {
      await htmx.ajax(method, url, {
        source: this.timeline,
        target: this.timeline,
        select: ".timeline > *",
        swap: "innerHTML",
        values,
      });
      if (failed) throw new Error("Request failed.");
    } finally {
      this.timeline.removeEventListener("htmx:afterRequest", checkResponse);
    }
  }
  restore(expanded, activeId, scroll) {
    this.timeline.querySelectorAll("details").forEach((group) => {
      group.open = [...group.querySelectorAll("article")].some(
        (item) => expanded.includes(item.dataset.itemId) || item.dataset.itemId === activeId,
      );
    });
    this.initializeGroups();
    this.timeline
      .querySelector(`[data-item-id="${activeId}"] button`)
      ?.focus({ preventScroll: true });
    window.scrollTo({ top: scroll });
    this.busy = false;
    [this.timeline, ...this.timeline.querySelectorAll("details")].forEach((container) =>
      Sortable.get(container)?.option("disabled", false),
    );
    this.timeline.removeAttribute("aria-busy");
  }
  dragDuration() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 150;
  }
  initializeGroups() {
    [this.timeline, ...this.timeline.querySelectorAll("details")].forEach((container) => {
      if (Sortable.get(container)) return;
      Sortable.create(container, {
        group: {
          name: "watchlist-items",
          put: () => !container.matches("details:not([open])"),
        },
        draggable: "article",
        handle: ".reorder-handle",
        animation: this.dragDuration(),
        delay: 180,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        onMove: () => !this.busy,
        onStart: () => {
          this.dragging = true;
        },
        onEnd: (event) => {
          this.dragging = false;
          if (this.busy) return;
          if (this.unchanged(event)) return;
          this.saveDrop(event.item);
        },
      });
    });
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
  onKeydown(event) {
    if (!event.altKey) return;
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    this.keyboardMove(event);
  }
  keyboardMove(event) {
    const row = event.target.closest("article");
    if (!row) return;
    if (this.busy) return;
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
initializeReorder();
document.addEventListener("htmx:load", initializeReorder);
