function optionLabel(option) {
  return option.textContent.trim();
}

function normalizeQuery(value) {
  return value.trim().toLowerCase();
}

function selectedOption(options) {
  return options.find((option) => option.getAttribute("aria-selected") === "true") ?? null;
}

function visibleOptions(options) {
  return options.filter((option) => !option.hidden);
}

function setExpanded(input, listbox, options, open) {
  input.setAttribute("aria-expanded", open ? "true" : "false");
  listbox.hidden = !open;
  if (open) return;
  input.removeAttribute("aria-activedescendant");
  for (const option of options) option.classList.remove("is-active");
}

function setActive(input, options, option) {
  for (const candidate of options) {
    candidate.classList.toggle("is-active", candidate === option);
  }
  if (option) {
    input.setAttribute("aria-activedescendant", option.id);
    option.scrollIntoView({ block: "nearest" });
    return;
  }
  input.removeAttribute("aria-activedescendant");
}

function filterOptions(input, options, empty, query) {
  const needle = normalizeQuery(query);
  let visibleCount = 0;
  for (const option of options) {
    const match = needle.length === 0 || optionLabel(option).toLowerCase().includes(needle);
    option.hidden = !match;
    if (match) visibleCount += 1;
  }
  empty.hidden = visibleCount > 0;
  setActive(input, options, visibleOptions(options)[0] ?? null);
}

function restoreInput(input, options) {
  const selected = selectedOption(options);
  input.value = selected ? optionLabel(selected) : "";
}

function selectOption(value, input, listbox, options, option, onSelect) {
  if (!(option instanceof HTMLElement)) return;
  value.value = option.dataset.value ?? "";
  value.dataset.order = option.dataset.order ?? "release";
  input.value = optionLabel(option);
  for (const candidate of options) {
    candidate.setAttribute("aria-selected", candidate === option ? "true" : "false");
  }
  setExpanded(input, listbox, options, false);
  onSelect?.();
  value.dispatchEvent(new Event("change", { bubbles: true }));
}

function openList(input, listbox, options, empty) {
  const selected = selectedOption(options);
  if (selected && input.value === optionLabel(selected)) {
    for (const option of options) option.hidden = false;
    empty.hidden = true;
    setActive(input, options, selected);
  } else {
    filterOptions(input, options, empty, input.value);
  }
  setExpanded(input, listbox, options, true);
}

function onKeydown(event, input, listbox, options, empty, select) {
  const visible = visibleOptions(options);
  const current =
    visible.find((option) => option.classList.contains("is-active")) ??
    selectedOption(visible) ??
    null;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (listbox.hidden) openList(input, listbox, options, empty);
    const index = current ? visible.indexOf(current) : -1;
    setActive(input, options, visible[Math.min(index + 1, visible.length - 1)] ?? null);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (listbox.hidden) openList(input, listbox, options, empty);
    const index = current ? visible.indexOf(current) : visible.length;
    setActive(input, options, visible[Math.max(index - 1, 0)] ?? null);
    return;
  }
  if (event.key === "Enter") {
    if (listbox.hidden || !current) return;
    event.preventDefault();
    select(current);
    return;
  }
  if (event.key === "Escape") {
    if (listbox.hidden) return;
    event.preventDefault();
    restoreInput(input, options);
    setExpanded(input, listbox, options, false);
  }
}

function bindWatchlistCombobox(root, onSelect) {
  if (!(root instanceof HTMLElement) || root.dataset.comboboxBound === "true") return;
  const value = root.querySelector("[data-watchlist-value]");
  const input = root.querySelector("[data-watchlist-input]");
  const listbox = root.querySelector("[data-watchlist-listbox]");
  const empty = root.querySelector("[data-watchlist-empty]");
  if (
    !(value instanceof HTMLInputElement) ||
    !(input instanceof HTMLInputElement) ||
    !(listbox instanceof HTMLElement) ||
    !(empty instanceof HTMLElement)
  ) {
    return;
  }
  root.dataset.comboboxBound = "true";
  const options = [...listbox.querySelectorAll('[role="option"]')].filter(
    (option) => option instanceof HTMLElement,
  );
  const select = (option) => selectOption(value, input, listbox, options, option, onSelect);

  input.addEventListener("focus", () => openList(input, listbox, options, empty));
  input.addEventListener("input", () => {
    setExpanded(input, listbox, options, true);
    filterOptions(input, options, empty, input.value);
  });
  input.addEventListener("keydown", (event) =>
    onKeydown(event, input, listbox, options, empty, select),
  );
  listbox.addEventListener("mousedown", (event) => {
    const option = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
    if (!(option instanceof HTMLElement) || option.hidden) return;
    event.preventDefault();
    select(option);
  });
  root.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && root.contains(next)) return;
    restoreInput(input, options);
    setExpanded(input, listbox, options, false);
  });
}

export function bindWatchlistComboboxes(root, onSelect) {
  for (const combobox of root.querySelectorAll("[data-watchlist-combobox]")) {
    bindWatchlistCombobox(combobox, onSelect);
  }
}
