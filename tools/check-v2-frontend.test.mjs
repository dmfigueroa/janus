import { describe, expect, it } from "vitest";
import {
  checkLayoutHtmxConfig,
  checkRefreshOobCoverage,
  checkScriptSource,
} from "./check-v2-frontend.mjs";

describe("V2 frontend guardrails", () => {
  it("rejects the former Safari closedBy pointer fallback from PR #318 and PR #372", () => {
    const pastMistake = `
      onPointerDown = (event) => {
        if (!("closedBy" in HTMLDialogElement.prototype)) {
          this.pressedOutside = pointerOutsideDialog(this.dialog, event);
        }
      };
    `;
    const violations = checkScriptSource("static/item-edit-dialog.js", pastMistake);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('closedby="any"');
  });

  it("rejects non-HTMX HTTP calls in V2 browser scripts", () => {
    expect(checkScriptSource("static/sample.js", 'fetch("/v2/watchlists")')).toHaveLength(1);
    expect(
      checkScriptSource("static/sample.js", 'htmx.ajax("GET", "/v2/watchlists")'),
    ).toHaveLength(1);
    expect(checkScriptSource("static/sample.js", "new XMLHttpRequest()")).toHaveLength(1);
  });

  it("rejects the tuple-loop event listener registration from PR #372", () => {
    const pastMistake = `
      this.documentEvents.forEach(([type, listener]) => document.addEventListener(type, listener));
    `;
    const violations = checkScriptSource("static/item-edit-dialog.js", pastMistake);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("addEventListener");
  });

  it("accepts explicit string-literal event listeners and native dialog calls", () => {
    const validScript = `
      document.addEventListener("click", this.onClick);
      document.removeEventListener("click", this.onClick);
      source.addEventListener(
        "htmx:afterRequest",
        this.onAfterRequest,
      );
      this.dialog.showModal();
    `;
    expect(checkScriptSource("static/item-edit-dialog.js", validScript)).toEqual([]);
  });

  it("rejects layout.html missing disableInheritance (PR #372 P1 root cause)", () => {
    const pastLayout = `<!doctype html><html><head><meta charset="utf-8" /></head></html>`;
    expect(checkLayoutHtmxConfig(pastLayout)).toHaveLength(1);

    const fixedLayout = `<!doctype html><html><head><meta name="htmx-config" content='{"disableInheritance":true}' /></head></html>`;
    expect(checkLayoutHtmxConfig(fixedLayout)).toEqual([]);
  });

  it("rejects unrefreshed sibling dialog forms from PR #318 and PR #370", () => {
    const templates = new Map([
      [
        "watchlist.html",
        `<main class="watchlist"></main>
         <span id="watchlist-refresh" hidden hx-get="" hx-target=".watchlist" hx-select=".watchlist" hx-select-oob="#watchlist-form"></span>
         {% include "watchlist-dialog.html" %}
         {% include "custom-item-dialog.html" %}
         {% include "item-edit-dialog.html" %}`,
      ],
      [
        "watchlist-dialog.html",
        `<dialog id="watchlist-dialog"><form id="watchlist-form"><input name="name" /></form></dialog>`,
      ],
      [
        "custom-item-dialog.html",
        `<dialog id="custom-item-dialog"><form id="custom-item-form"><input name="title" /></form></dialog>`,
      ],
      [
        "item-edit-dialog.html",
        `<dialog id="item-edit-dialog"><form id="item-edit-form" class="dialog-form"></form></dialog>`,
      ],
    ]);

    const violations = checkRefreshOobCoverage("watchlist.html", templates);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("#custom-item-form");
    expect(violations[0]).toContain("hx-select-oob");
  });
});
