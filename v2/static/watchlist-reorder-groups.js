export class WatchlistReorderGroups {
  static containers(watchlist) {
    return [watchlist, ...watchlist.querySelectorAll("details")];
  }

  static initialize(watchlist) {
    this.containers(watchlist).forEach((container) => {
      if (Sortable.get(container)) return;
      Sortable.create(container, {
        group: {
          name: "watchlist-items",
          put: () => !container.matches("details:not([open])"),
        },
        draggable: "article",
        handle: ".reorder-handle",
        animation: watchlist.dragDuration(),
        delay: 180,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        onMove: () => !watchlist.busy,
        onStart: () => {
          watchlist.dragging = true;
        },
        onEnd: (event) => {
          watchlist.dragging = false;
          if (watchlist.busy || watchlist.unchanged(event)) return;
          watchlist.saveDrop(event.item);
        },
      });
    });
  }

  static destroy(watchlist) {
    this.containers(watchlist).forEach((container) => Sortable.get(container)?.destroy());
  }
}
