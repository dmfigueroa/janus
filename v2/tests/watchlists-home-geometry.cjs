// Browser-side measurements for the watchlists home layout check.

function evaluateLayout(page) {
  return page.evaluate(() => {
    function round(value) {
      return Math.round(value * 100) / 100;
    }
    function rectOf(element) {
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    function visibleGrid() {
      return [...document.querySelectorAll(".watchlist-grid")].find(
        (candidate) => candidate.getClientRects().length > 0,
      );
    }
    function cardsOf(grid) {
      if (!grid) return [];
      return [...grid.querySelectorAll(".watchlist-card")]
        .map(rectOf)
        .filter((card) => card.width > 0);
    }
    function columnsOf(grid) {
      if (!grid) return 0;
      return getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
    }
    function rowsOf(cards) {
      const rows = [];
      for (const card of cards) {
        const row = rows.find((candidate) => Math.abs(candidate.top - card.top) <= 1);
        if (row) row.count += 1;
        else rows.push({ top: card.top, count: 1 });
      }
      return rows.sort((left, right) => left.top - right.top);
    }
    function headingSnapshot() {
      const heading = document.querySelector(".browse-heading h2");
      if (!heading) return null;
      return {
        text: heading.textContent.trim(),
        visible: !!(heading.offsetWidth || heading.offsetHeight),
      };
    }
    const grid = visibleGrid();
    const cards = cardsOf(grid);
    return {
      grid: {
        columns: columnsOf(grid),
        cardCount: cards.length,
        rows: rowsOf(cards),
        cardWidths: [...new Set(cards.map((card) => card.width))],
        cards,
      },
      overflow: {
        viewportWidth: window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      },
      heading: headingSnapshot(),
    };
  });
}

function evaluateControls(page) {
  return page.evaluate(() => {
    function round(value) {
      return Math.round(value * 100) / 100;
    }
    function rectOf(element) {
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    function optionalRect(element) {
      return element ? rectOf(element) : null;
    }
    function homeRoot() {
      return document.querySelector("main.home") ?? document.body;
    }
    function controlLabel(control) {
      return `${control.getAttribute("aria-label") ?? ""} ${control.textContent}`;
    }
    function sortLabelMatches() {
      const matches = [];
      for (const control of homeRoot().querySelectorAll("button, a, [role='button']")) {
        const label = controlLabel(control);
        if (/\bsort\b/i.test(label)) matches.push(label.trim().replace(/\s+/g, " "));
      }
      return matches;
    }
    function sortControls() {
      const labels = [
        ...homeRoot().querySelectorAll(
          "select, [role='combobox'], [data-sort], [data-sort-control]",
        ),
      ].map(controlLabel);
      return [...new Set([...labels, ...sortLabelMatches()])].filter(Boolean);
    }
    function clearSnapshot() {
      const clear = document.querySelector(".search-field .clear-search");
      if (!clear) return null;
      return {
        display: getComputedStyle(clear).display,
        accessibleName: clear.getAttribute("aria-label"),
        href: clear.getAttribute("href"),
        rect: rectOf(clear),
        field: optionalRect(document.querySelector(".search-field")),
        input: optionalRect(document.querySelector("#query")),
      };
    }
    function searchValue() {
      const input = document.querySelector("#query");
      if (!input) return null;
      return input.value;
    }
    return {
      sortControls: sortControls(),
      clear: clearSnapshot(),
      searchValue: searchValue(),
    };
  });
}

async function measureHome(page) {
  const [layout, controls] = await Promise.all([evaluateLayout(page), evaluateControls(page)]);
  return {
    grid: layout.grid,
    overflow: layout.overflow,
    heading: layout.heading,
    sortControls: controls.sortControls,
    clear: controls.clear,
    searchValue: controls.searchValue,
  };
}

module.exports = { measureHome };
