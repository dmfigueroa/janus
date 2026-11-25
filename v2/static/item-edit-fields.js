const TMDB_PREVIEW_PREFIX = "https://image.tmdb.org/t/p/w500";

export function resolvePosterPreviewUrl(value) {
  if (!value) return null;
  if (value.startsWith("/")) {
    return value.length > 1 && !/\s/.test(value) ? `${TMDB_PREVIEW_PREFIX}${value}` : null;
  }
  if (!value.startsWith("https://") || /\s/.test(value)) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname ? value : null;
  } catch {
    return null;
  }
}

export function syncPosterPreview(dialog, value) {
  const wrap = dialog.querySelector("[data-poster-preview-wrap]");
  const image = dialog.querySelector("[data-poster-preview]");
  if (!wrap || !image) return;
  const url = resolvePosterPreviewUrl(value);
  if (!url) {
    wrap.hidden = true;
    image.removeAttribute("src");
    return;
  }
  image.referrerPolicy = "no-referrer";
  image.setAttribute("src", url);
  wrap.hidden = false;
}

export function syncClearDateButton(dialog, value) {
  const button = dialog.querySelector("[data-clear-release-date]");
  if (button) button.hidden = value.length === 0;
}

export function clearReleaseDate(dialog) {
  const input = dialog.querySelector("#item-edit-release-date");
  if (!input) return;
  input.value = "";
  syncClearDateButton(dialog, "");
  input.focus();
}

export function closeAllItemMenus() {
  document.querySelectorAll("[data-item-actions-trigger]").forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll(".item-actions-menu").forEach((menu) => {
    menu.hidden = true;
  });
}

export function toggleItemMenu(trigger) {
  const menuId = trigger.getAttribute("aria-controls");
  const menu = menuId ? document.getElementById(menuId) : null;
  const willOpen = Boolean(menu && menu.hidden);
  closeAllItemMenus();
  if (!willOpen || !menu) return;
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  menu.querySelector("button")?.focus();
}

export function expandedWatchedItemIds() {
  return [...document.querySelectorAll(".watchlist details.watched-run[open]")].flatMap((group) =>
    [...group.querySelectorAll("article")].map((row) => row.dataset.itemId),
  );
}

export function restoreItemFocus(itemId, expanded) {
  document.querySelectorAll(".watchlist details.watched-run").forEach((group) => {
    group.open = [...group.querySelectorAll("article")].some((row) =>
      expanded.includes(row.dataset.itemId),
    );
  });
  const trigger = itemId ? document.querySelector(`[data-item-actions-trigger="${itemId}"]`) : null;
  if (trigger && !trigger.closest("details:not([open])")) {
    trigger.focus();
    return;
  }
  const fallback =
    document.querySelector(".watchlist #query") || document.querySelector(".watchlist h1");
  fallback?.focus();
}

export function syncDialogDescribedBy(dialog) {
  const error = dialog.querySelector("#item-edit-form-error");
  const hasError = Boolean(error?.textContent?.trim());
  dialog.setAttribute(
    "aria-describedby",
    hasError ? "item-edit-dialog-help item-edit-form-error" : "item-edit-dialog-help",
  );
}

export function focusInitialItemField(dialog) {
  const target =
    dialog.querySelector('[aria-invalid="true"]') || dialog.querySelector("#item-edit-title");
  target?.focus();
}

export function setDialogBusy(dialog, busy) {
  if (busy) dialog.setAttribute("aria-busy", "true");
  else dialog.removeAttribute("aria-busy");
  const footer = dialog.querySelector(".dialog-footer");
  if (footer) {
    if (busy) footer.setAttribute("aria-busy", "true");
    else footer.removeAttribute("aria-busy");
  }
  dialog.querySelectorAll("[data-item-edit-dialog-close]").forEach((control) => {
    control.disabled = busy;
  });
}

export function pointerOutsideDialog(dialog, event) {
  const bounds = dialog.getBoundingClientRect();
  return (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  );
}
