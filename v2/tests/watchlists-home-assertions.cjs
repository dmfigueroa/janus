// Layout assertions shared by the watchlists home browser check.
const assert = require("node:assert/strict");

const positionTolerance = 1;
const cardWidthCap = 220;

function formatRects(rects) {
  return rects
    .map(
      (rect) =>
        `${rect.left.toFixed(2)}..${rect.right.toFixed(2)}@${rect.top.toFixed(2)} (${rect.width.toFixed(2)}x${rect.height.toFixed(2)})`,
    )
    .join(", ");
}

function assertNoOverflow(measured, label) {
  const { overflow, grid } = measured;
  assert.ok(
    overflow.documentScrollWidth <= overflow.documentClientWidth,
    `${label}: horizontal overflow measured: document scrollWidth ${overflow.documentScrollWidth}px exceeds clientWidth ${overflow.documentClientWidth}px`,
  );
  assert.ok(
    overflow.bodyScrollWidth <= overflow.documentClientWidth,
    `${label}: horizontal overflow measured: body scrollWidth ${overflow.bodyScrollWidth}px exceeds clientWidth ${overflow.documentClientWidth}px`,
  );
  const beyondRight = grid.cards.filter((card) => card.right > overflow.viewportWidth + 0.5);
  assert.deepEqual(
    beyondRight,
    [],
    `${label}: cards leave the viewport on the right: measured ${formatRects(beyondRight)}, viewport width ${overflow.viewportWidth}px`,
  );
  const beyondLeft = grid.cards.filter((card) => card.left < -0.5);
  assert.deepEqual(
    beyondLeft,
    [],
    `${label}: cards leave the viewport on the left: measured ${formatRects(beyondLeft)}`,
  );
}

function assertGridDensity(measured, expectedColumns, label) {
  const { columns, cardCount, rows, cardWidths } = measured.grid;
  assert.equal(
    columns,
    expectedColumns,
    `${label}: grid columns: measured ${columns}, expected ${expectedColumns}`,
  );
  assert.ok(
    cardCount >= expectedColumns,
    `${label}: grid cards: measured ${cardCount}, expected at least ${expectedColumns} fixture cards`,
  );
  const expectedRows = Math.ceil(cardCount / expectedColumns);
  assert.equal(
    rows.length,
    expectedRows,
    `${label}: grid rows: measured ${rows.length} rows (${rows.map((row) => row.count).join(", ")}), expected ${expectedRows} rows for ${cardCount} cards in ${expectedColumns} columns`,
  );
  const widestRow = Math.max(...rows.map((row) => row.count));
  assert.equal(
    widestRow,
    Math.min(cardCount, expectedColumns),
    `${label}: grid density: measured at most ${widestRow} cards on one row, expected ${Math.min(cardCount, expectedColumns)}`,
  );
  const widestCard = Math.max(...cardWidths);
  assert.ok(
    widestCard <= cardWidthCap + 0.5,
    `${label}: card width cap: measured widest card ${widestCard.toFixed(2)}px, expected at most ${cardWidthCap}px; measured widths [${cardWidths.join(", ")}]`,
  );
}

function assertNoSortControl(measured, label) {
  assert.deepEqual(
    measured.sortControls,
    [],
    `${label}: sort controls: measured ${JSON.stringify(measured.sortControls)}, expected none on the watchlists home`,
  );
}

function assertHeading(measured, expectedText, label) {
  assert.ok(
    measured.heading,
    `${label}: heading: measured none, expected a visible "${expectedText}" heading`,
  );
  assert.equal(
    measured.heading.text,
    expectedText,
    `${label}: heading text: measured "${measured.heading.text}", expected "${expectedText}"`,
  );
  assert.ok(
    measured.heading.visible,
    `${label}: heading: measured hidden, expected visible "${expectedText}"`,
  );
}

function assertClearHidden(measured, label) {
  assert.ok(
    measured.clear,
    `${label}: clear search control: measured none, expected the search field to own one`,
  );
  assert.equal(
    measured.clear.display,
    "none",
    `${label}: clear search control: measured display "${measured.clear.display}" while the field is empty, expected "none"`,
  );
  assert.equal(
    measured.searchValue,
    "",
    `${label}: search field: measured value "${measured.searchValue}", expected an empty field`,
  );
}

function assertClearPlacement(measured, label) {
  const { clear } = measured;
  assert.ok(
    clear,
    `${label}: clear search control: measured none, expected the search field to own one`,
  );
  assert.equal(
    clear.display,
    "grid",
    `${label}: clear search control: measured display "${clear.display}" while the field is populated, expected "grid"`,
  );
  assert.equal(
    clear.accessibleName,
    "Clear search",
    `${label}: clear search control: measured accessible name "${clear.accessibleName}"`,
  );
  assert.equal(
    clear.href,
    "/v2/watchlists",
    `${label}: clear search control: measured href "${clear.href}"`,
  );
  assert.ok(clear.field, `${label}: clear search control: measured no search field to place it in`);
  assert.ok(
    clear.input,
    `${label}: clear search control: measured no search input to center against`,
  );
  assert.ok(
    clear.rect.width > 0 && clear.rect.height > 0,
    `${label}: clear search control: measured ${formatRects([clear.rect])}`,
  );
  const outsideField = [
    clear.rect.left < clear.field.left - positionTolerance,
    clear.rect.right > clear.field.right + positionTolerance,
    clear.rect.top < clear.field.top - positionTolerance,
    clear.rect.bottom > clear.field.bottom + positionTolerance,
  ].filter(Boolean);
  assert.deepEqual(
    outsideField,
    [],
    `${label}: clear search control leaves the search field: measured ${formatRects([clear.rect])}, field ${formatRects([clear.field])}`,
  );
  const rightInset = clear.field.right - clear.rect.right;
  assert.ok(
    rightInset >= 0,
    `${label}: clear search control: measured ${rightInset.toFixed(2)}px past the search field right edge`,
  );
  assert.ok(
    rightInset <= 12,
    `${label}: clear search control: measured ${rightInset.toFixed(2)}px from the search field right edge, expected at most 12px`,
  );
  assert.ok(
    clear.rect.left >= clear.field.left + clear.field.width / 2,
    `${label}: clear search control: measured on the field's left half (${formatRects([clear.rect])}), expected the trailing side`,
  );
  const verticalOffset = Math.abs(
    (clear.rect.top + clear.rect.bottom) / 2 - (clear.input.top + clear.input.bottom) / 2,
  );
  assert.ok(
    verticalOffset <= positionTolerance,
    `${label}: clear search control: measured ${verticalOffset.toFixed(2)}px from the input's vertical center, expected at most ${positionTolerance}px`,
  );
}

module.exports = {
  assertClearHidden,
  assertClearPlacement,
  assertGridDensity,
  assertHeading,
  assertNoOverflow,
  assertNoSortControl,
};
