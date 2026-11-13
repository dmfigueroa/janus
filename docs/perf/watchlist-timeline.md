# Watchlist timeline performance (v1)

Decision record and reproduction notes for
[#294](https://github.com/dmfigueroa/janus/issues/294):
profile large v1 watchlist timelines and virtualize only when measurements justify it.

## Decision

The v1 timeline was measured with its current progressive pagination, and long lists were
materially slow: every loaded page stays mounted, so a 700-row release timeline held 39,871
DOM elements, allocated about 800 MB of JS heap, spent minutes of long-task time while
pages loaded, and took 17.2 s to re-render after toggling the watched filter. That is a
measured, reproducible rendering and interaction bottleneck, so the timeline now bounds
mounted rows with TanStack Virtual.

After the change the same 700-row dataset keeps 11-20 rows mounted, stays under 1,000 DOM
elements, and the same filter toggle completes in about 200 ms. Mounted work no longer grows
with the number of loaded pages.

## Scope

- Applies to the v1 TypeScript timeline only. The Rust v2 rewrite (#250) is unaffected.
- Release order, custom order, comics, filtering, watched-run collapsing, pagination,
  reorder, and focus retention stay in scope.
- The harness, not CI, owns performance evidence. A CI gate on this shared-runner latency
  would be noise, so the numbers below are recorded with their environment.

## Reproduction

### 1. Seed a deterministic fixture

```bash
node tools/bench/SeedTimelineFixture.mjs --database /tmp/janus-timeline-bench.sqlite --items 2000
```

The script creates three watchlists:

| id  | name              | order mode      | items |
| --- | ----------------- | --------------- | ----- |
| 1   | Benchmark Release | release         | 2,000 |
| 2   | Benchmark Custom  | custom (ranked) | 2,000 |
| 3   | Benchmark Comics  | release         | 500   |

Titles include long, non-Latin, and single-character names; every third item is watched;
about one in 37 items has no release date (`TBA`); episodes carry season/episode numbers and
comics carry authors. Poster paths stay empty so runs do not depend on TMDB.

### 2. Serve a production build against the fixture

```bash
DATABASE_URL=/tmp/janus-timeline-bench.sqlite npm run build
PORT=3001 DATABASE_URL=/tmp/janus-timeline-bench.sqlite node .output/server/index.mjs
```

Measure production output. The dev server adds React development overhead and Vite HMR to
every reading.

### 3. Run the harness

Playwright is not a repository dependency; install it locally without saving:

```bash
npm install --no-save playwright@1.56.1
npx playwright install chromium

node tools/bench/MeasureTimeline.mjs --base-url http://localhost:3001 --watchlist 1 --label release-700 --rows 700
node tools/bench/MeasureTimeline.mjs --base-url http://localhost:3001 --watchlist 2 --label custom-500 --rows 500
node tools/bench/MeasureTimeline.mjs --base-url http://localhost:3001 --watchlist 1 --label mobile-300 --rows 300 --mobile
```

`--rows` is the number of items to load, counted in pages of 50. The script scrolls through
the document until that many items are loaded, then measures mounted rows, DOM size, JS heap,
scroll frame pacing, filter latency, watched-run expansion, search keystroke paint, and
reorder cost. It prints one JSON report.

For the baseline, run the same harness against a build of the parent commit of the
virtualization change. Both sides of the comparison below used the same harness and the same
fixture.

### 4. Compare scroll pacing separately

The harness scrolls `60%` of the viewport every animation frame, which mounts several rows per
frame and is stricter than a real scroll. Frame pacing was also checked with a short probe
that scrolls `120 px` per frame and `540 px` per frame for three seconds. Use that probe when
judging scroll smoothness; use the harness report for the load and interaction numbers.

## Environment

| Item                               | Value                                                             |
| ---------------------------------- | ----------------------------------------------------------------- |
| Browser                            | Chromium Headless Shell 141.0.7390.37 (Playwright 1.56.1), no GPU |
| CPU                                | 4 vCPU AMD EPYC (shared container)                                |
| Memory                             | 7.8 GB                                                            |
| Build                              | production `npm run build` + Nitro server, SQLite fixture         |
| Desktop viewport                   | 1280 x 900, DPR 1                                                 |
| Mobile viewport                    | 390 x 844, DPR 3, mobile + touch emulation                        |
| Device memory reported by Chromium | 8 GB                                                              |

Absolute numbers belong to this shared 4-vCPU container, not to a phone or laptop. Compare
before/after on one machine. Mounted rows, DOM elements, and heap are the machine-independent
columns. The harness records a machine calibration (`domBuild5000NodesMs`, idle frame pacing)
for each run; runs whose calibration is far off the others were discarded, and the tables
below come from runs with sub-70 ms idle p95 and sub-400 ms calibration.

## Results

All runs load the dataset through scroll-triggered pagination in 50-item pages. "Mounted rows"
is `[data-testid^="watchlist-timeline-row-"]`, which excludes collapsed watched-run
disclosures and year headings. Timings are single runs from the same harness on the same
machine.

### Release order, 300 items (6 pages)

| Metric                           | Before   | After    |
| -------------------------------- | -------- | -------- |
| Mounted timeline rows            | 374      | 18       |
| DOM elements                     | 17,374   | 972      |
| JS heap after load               | 595 MB   | 33.5 MB  |
| First row painted                | 3,141 ms | 1,239 ms |
| Long-task total while loading    | 61.5 s   | 17.6 s   |
| Longest long task                | 4,010 ms | 765 ms   |
| Filter toggle (Unwatched to All) | 8,811 ms | 282 ms   |
| Watched-run expansion            | 1,548 ms | 182 ms   |
| Search keystroke to paint        | 3,807 ms | 35 ms    |
| Scroll frame p95 (harness probe) | 132 ms   | 72 ms    |

### Release order, 700 items (14 pages)

| Metric                           | Before    | After   |
| -------------------------------- | --------- | ------- |
| Mounted timeline rows            | 867       | 11      |
| DOM elements                     | 39,871    | 666     |
| JS heap after load               | 803 MB    | 54.2 MB |
| First row painted                | 2,541 ms  | 818 ms  |
| Long-task total while loading    | 339.3 s   | 72.3 s  |
| Longest long task                | 11,719 ms | 556 ms  |
| Filter toggle (Unwatched to All) | 17,176 ms | 203 ms  |
| Watched-run expansion            | 747 ms    | 137 ms  |
| Search keystroke to paint        | 10,358 ms | 25 ms   |
| Scroll frame p95 (harness probe) | 132 ms    | 123 ms  |

### Custom order, 500 items (10 pages)

| Metric                           | Before    | After    |
| -------------------------------- | --------- | -------- |
| Mounted timeline rows            | 633       | 11       |
| DOM elements                     | 35,585    | 756      |
| JS heap after load               | 441 MB    | 51.0 MB  |
| First row painted                | 2,479 ms  | 1,446 ms |
| Long-task total while loading    | 251.5 s   | 57.5 s   |
| Longest long task                | 8,620 ms  | 639 ms   |
| Filter toggle (Unwatched to All) | 12,660 ms | 467 ms   |
| Watched-run expansion            | 1,590 ms  | 382 ms   |
| Search keystroke to paint        | 10,148 ms | 52 ms    |
| Drop to reordered rows           | 15,337 ms | 109 ms   |
| Scroll frame p95 (harness probe) | 207 ms    | 67 ms    |

Reorder still resolves against the full loaded order. In both runs the scripted drag was
verified to change the first rows, and the after run was additionally checked across a page
reload so the order was server-persisted rather than only optimistic.

### Simulated mobile, release order, 300 items (6 pages)

| Metric                           | Before   | After    |
| -------------------------------- | -------- | -------- |
| Mounted timeline rows            | 341      | 10       |
| DOM elements                     | 15,843   | 606      |
| JS heap after load               | 441 MB   | 35.6 MB  |
| First row painted                | 2,317 ms | 1,038 ms |
| Long-task total while loading    | 70.3 s   | 14.8 s   |
| Longest long task                | 6,571 ms | 570 ms   |
| Filter toggle (Unwatched to All) | 7,505 ms | 224 ms   |
| Watched-run expansion            | 350 ms   | 162 ms   |
| Search keystroke to paint        | 3,305 ms | 31 ms    |
| Scroll frame p95 (harness probe) | 72 ms    | 46 ms    |

Mobile runs use Chromium device emulation at 390 x 844 with touch enabled. They are
simulated viewport checks, not real-device validation. No physical iOS or Android device was
tested; treat mobile frame pacing and touch drag as unverified on hardware.

### Dedicated scroll probe

Same page, 3-second scroll probe, after memoizing timeline slots:

| Probe            | Before p50 / p95 | After p50 / p95 |
| ---------------- | ---------------- | --------------- |
| 120 px per frame | 21 / 58 ms       | 21 / 75 ms      |
| 540 px per frame | 37 / 174 ms      | 39 / 98 ms      |

Scrolling no longer regresses from virtualization. The first virtualized build re-rendered
every mounted slot on each scroll event and the 120 px probe showed a 75 ms median; memoizing
slots removed that work. The remaining gap at small steps is one or two row mounts per
viewport crossing.

## What the numbers mean

- The cost of the timeline scaled with mounted rows, not with the dataset. Doubling loaded
  items roughly doubled DOM size, heap, and interaction latency, which is why pagination
  accumulated into multi-second interactions.
- Bounding the mounted window removes that scaling: 300, 500, and 700 loaded items now report
  the same order of magnitude for mounted rows, DOM elements, and heap.
- Filter, search, expansion, and reorder latencies are now dominated by the handful of
  mounted rows plus Chakra style work, not by the loaded dataset.
- ResizeObserver-based measurement keeps variable row heights (wrapping titles, media posters,
  episode/author rows); the estimate only decides the initial scroll extent.

## Implementation notes

- The timeline flattens year headings, watched-run disclosures, and item rows into one block
  list (`buildWatchlistTimelineBlocks`) and hands it to `useWindowVirtualizer`.
- Collapsed watched runs stay one disclosure block; expanding a run emits its rows as sibling
  blocks, so a large run is still bounded by the virtual window. Expansion state lives on the
  timeline, which is why it survives rows unmounting.
- Year headings render inline at the start of each year. Once a heading scrolls under the
  sticky offset, a pinned heading takes over at that offset.
- Rows only register as sortables when a drag handle is rendered. Release-mode timelines and
  pending reorder states no longer measure or subscribe every mounted row.
- Action dialogs mount only while open. A closed row no longer builds five dialog roots,
  their providers, and their mutation hooks.
- Timeline slots and block content are memoized so a scroll-driven range change does not
  re-render rows that were already mounted.
- The focused row is pinned into the render window through the range extractor, so keyboard
  focus is not dropped when the row would leave the overscan range.
- The first screen of rows is server rendered through the virtualizer's initial viewport, so
  the watchlist page does not start with an empty timeline before hydration.
- Overscan is 8 rows and the estimate is 136 px. The measured window stays at 10-20 rows for
  every dataset size tested.

## Behavior preserved

- Release order still groups rows by year with `TBA` at the end, and custom order still renders
  a single flat list.
- Year headings stay sticky: an inline heading at each year start, then a pinned heading at the
  sticky offset.
- Watched-run collapsing still collapses consecutive watched rows into one disclosure,
  expansion state survives unmounting, and the disclosure remains keyboard operable.
- Infinite pagination still loads the next page when the endcap sentinel enters view, and
  appended pages keep the existing scroll position.
- Reorder keeps the existing dnd-kit mouse and touch sensors, the drag overlay, handle
  semantics, and optimistic cache updates. Rows that leave the virtual window unmount, so a
  drag can only target mounted rows plus the rows dnd-kit auto-scrolls into view.
- Keyboard access to row actions, the watched toggle, and the disclosure is unchanged; there
  is no keyboard drag sensor in the app before or after this change.
- The existing drag-failure and reorder tests still pass unchanged, including the
  asynchronous drop preparation path.

## Behavior changes

- Year headings are no longer one sticky element per year. They are an inline heading plus a
  single pinned heading for the year under the sticky offset, which is visually close but not
  identical DOM.
- Watched-run expansion state lives on the timeline instead of inside each run.
- The timeline renders a bounded row window server side (roughly one desktop viewport) instead
  of every row on the first page.
- A very long drag cannot target a row that was never mounted and is not reachable by
  auto-scroll.

## Known limitations

- The harness runs in headless Chromium in a shared container. Frame pacing on real hardware,
  on low-end phones, and with touch drag remains unverified.
- Chromium reports a React hydration error (`Minified React error #418`) on the watchlist page
  in both the baseline and virtualized builds. It predates this change, is not caused by the
  virtualizer, and should be tracked separately.
- Reorder across a very long distance relies on dnd-kit auto-scrolling rows into the mounted
  window. Raising overscan is the lever if that proves too tight in practice.
- The v1 app is maintained alongside the approved Rust v2 rewrite (#250). This change keeps
  v1 usable; it is not a new list architecture.

## Revisit triggers

- A timeline interaction exceeds roughly 200 ms on a mid-range laptop in production usage
  (filter, expand, search keystroke, or drop-to-render).
- Reorder complaints about dragging between rows that are far apart.
- Row heights become dynamic enough that the 136 px estimate causes visible scrollbar or
  anchor jumps before measurement lands.
