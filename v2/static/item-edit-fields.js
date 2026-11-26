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

export function clearReleaseDate(dialog) {
  const input = dialog.querySelector("#item-edit-release-date");
  if (!input) return;
  input.value = "";
  input.focus();
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

export function requestElement(event) {
  const element = event.detail?.elt || event.detail?.requestConfig?.elt;
  return element instanceof Element ? element : null;
}

export function showItemNotification(message, previousTimeout) {
  const notification = document.getElementById("notification");
  if (!notification) return 0;
  notification.textContent = message;
  notification.removeAttribute("hidden");
  window.clearTimeout(previousTimeout);
  return window.setTimeout(() => {
    notification.setAttribute("hidden", "");
  }, 4000);
}

export function showFormError(form, message) {
  const error = form.querySelector("#item-edit-form-error");
  if (error) error.textContent = message;
}
