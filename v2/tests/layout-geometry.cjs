// Browser-side geometry readers for the v1 and v2 watchlist homes.

function v1Layout(page) {
  return page.evaluate(() => {
    function round(value) {
      return Math.round(value * 100) / 100;
    }
    function geometryOf(element) {
      const box = element.getBoundingClientRect();
      return {
        left: round(box.left),
        right: round(box.right),
        top: round(box.top),
        bottom: round(box.bottom),
        width: round(box.width),
        height: round(box.height),
      };
    }
    function footerItems() {
      const nav = document.querySelector('nav[aria-label="Primary navigation"]');
      if (!nav) return [];
      return [...nav.querySelectorAll("a")].map((item) => ({
        label: item.textContent.trim().replace(/\s+/g, " "),
        ...geometryOf(item),
      }));
    }
    function gridColumns() {
      const card = document.querySelector('[role="group"]');
      for (let node = card; node; node = node.parentElement) {
        if (getComputedStyle(node).display.includes("grid")) {
          return getComputedStyle(node).gridTemplateColumns.split(/\s+/).length;
        }
      }
      return 0;
    }
    function heading() {
      const node = [...document.querySelectorAll("h2")].find(
        (candidate) => candidate.textContent.trim() === "Watchlists",
      );
      if (!node) return null;
      return {
        text: node.textContent.trim(),
        visible: !!(node.offsetWidth || node.offsetHeight),
      };
    }
    const cards = [...document.querySelectorAll('[role="group"]')]
      .map(geometryOf)
      .filter((card) => card.width > 0);
    return {
      footer: { items: footerItems() },
      grid: {
        columns: gridColumns(),
        cardWidths: [...new Set(cards.map((card) => card.width))],
      },
      heading: heading(),
    };
  });
}

function v2Layout(page) {
  return page.evaluate(() => {
    function round(value) {
      return Math.round(value * 100) / 100;
    }
    function geometryOf(element) {
      const box = element.getBoundingClientRect();
      return {
        left: round(box.left),
        right: round(box.right),
        top: round(box.top),
        bottom: round(box.bottom),
        width: round(box.width),
        height: round(box.height),
      };
    }
    function visibleGrid() {
      return [...document.querySelectorAll(".watchlist-grid")].find(
        (candidate) => candidate.getClientRects().length > 0,
      );
    }
    function footerItems() {
      const nav = document.querySelector(".bottom-nav");
      if (!nav) return [];
      return [...nav.querySelectorAll("a.nav-item")].map((item) => ({
        label: item.textContent.trim().replace(/\s+/g, " "),
        ...geometryOf(item),
      }));
    }
    function measuredCards() {
      const grid = visibleGrid();
      if (!grid) return [];
      return [...grid.querySelectorAll(".watchlist-card")]
        .map(geometryOf)
        .filter((card) => card.width > 0);
    }
    function gridColumns() {
      const grid = visibleGrid();
      if (!grid) return 0;
      return getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length;
    }
    function heading() {
      const node = document.querySelector(".browse-heading h2");
      if (!node) return null;
      return {
        text: node.textContent.trim(),
        visible: !!(node.offsetWidth || node.offsetHeight),
      };
    }
    const cards = measuredCards();
    return {
      footer: { items: footerItems() },
      grid: {
        columns: gridColumns(),
        cardCount: cards.length,
        cardWidths: [...new Set(cards.map((card) => card.width))],
      },
      heading: heading(),
    };
  });
}

module.exports = { v1Layout, v2Layout };
