class WatchlistBrowser extends HTMLElement {
  pendingRequests = new Set();

  connectedCallback() {
    this.addEventListener("htmx:beforeRequest", this.onBeforeRequest);
    this.addEventListener("htmx:afterRequest", this.onAfterRequest);
    this.addEventListener("htmx:afterSwap", this.onAfterSwap);
    this.addEventListener("htmx:responseError", this.onRequestFailure);
    this.addEventListener("htmx:sendError", this.onRequestFailure);
  }

  disconnectedCallback() {
    this.removeEventListener("htmx:beforeRequest", this.onBeforeRequest);
    this.removeEventListener("htmx:afterRequest", this.onAfterRequest);
    this.removeEventListener("htmx:afterSwap", this.onAfterSwap);
    this.removeEventListener("htmx:responseError", this.onRequestFailure);
    this.removeEventListener("htmx:sendError", this.onRequestFailure);
    this.pendingRequests.clear();
  }

  onBeforeRequest = (event) => {
    if (!this.owns(event)) return;
    this.pendingRequests.add(event.detail.xhr);
    this.browse?.setAttribute("aria-busy", "true");
    this.setStatus("");
  };

  onAfterRequest = (event) => {
    if (!this.owns(event)) return;
    this.pendingRequests.delete(event.detail.xhr);
    this.browse?.setAttribute("aria-busy", String(this.pendingRequests.size > 0));
    if (event.detail?.successful) this.setStatus("");
  };

  onAfterSwap = (event) => {
    if (!this.owns(event)) return;
    if (event.detail.requestConfig.elt.matches("[data-page-link]")) {
      this.browse?.querySelector(".browse-heading h2")?.focus();
    }
  };

  onRequestFailure = (event) => {
    if (!this.owns(event)) return;
    this.setStatus("Unable to load watchlists. Please try again.");
  };

  get browse() {
    return this.querySelector("#watchlist-browse");
  }

  owns(event) {
    const { xhr } = event.detail ?? {};
    const requestElement = event.detail?.requestConfig?.elt;
    const elementIsInside = requestElement instanceof Element && this.contains(requestElement);
    return elementIsInside || this.pendingRequests.has(xhr);
  }

  setStatus(message) {
    const status = this.querySelector("#browse-status");
    if (status) status.textContent = message;
  }
}

customElements.define("watchlist-browser", WatchlistBrowser);
