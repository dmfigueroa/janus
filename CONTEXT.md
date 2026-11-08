# Janus Watchlists

This context defines the concepts used to collect and curate media in personal watchlists.

## Language

**Watchlist item**:
A media entry stored in a watchlist, including its user-visible metadata such as title, release date, and poster image.
_Avoid_: List entry, item record

**Edited metadata**:
The current user-maintained title, release date, or poster image of a watchlist item. Editing replaces the stored value permanently.
_Avoid_: Metadata override, temporary edit

**Poster image**:
The image displayed for a watchlist item, represented by either a provider path or a full image URL.
_Avoid_: Picture, cover art

**Release date**:
The complete calendar date associated with an entry, always represented with a year, month, and day.
_Avoid_: Release year

**Rotation**:
The global recency order used to surface what to watch next. A watchlist leaves the rotation while it is paused, completed, or empty, and returns automatically once none of those apply.
_Avoid_: Active queue, cycle

**Lineup**:
A named grouping of watchlists on Watch Now. Automatic lineups group by the next unwatched item's media type; custom lineups contain explicitly selected watchlists. All lineups share the global rotation, and paused, completed, or empty members remain configured but are not eligible for display.
_Avoid_: Separate rotation, independent viewing history

**Paused**:
The persisted on/off state that removes a watchlist from the rotation without deleting it. Pausing records when the pause began, and repeated pausing preserves that time; resuming clears it and returns the list to its previous position in the rotation.
_Avoid_: Archived, hidden, snoozed

**Completed**:
The derived state of a watchlist with at least one item and every item watched. It is never stored; adding an unwatched item or unwatching an item un-completes the list automatically, without clearing its pause.
_Avoid_: Finished, done, watched

**Watchlist addition**:
A request to collect media in a watchlist. Adding a TV show or comic volume expands it into individual watchlist items. An addition may succeed without changing the watchlist when its items are already present or no items are available.
_Avoid_: Import job

**Addition outcome**:
The result of a watchlist addition, including whether it succeeded, why it changed or did not change the watchlist, and how many watchlist items were actually added.
_Avoid_: Attempted count

**Empty**:
A watchlist containing no watchlist items. It is not completed and is excluded from the rotation and Watch Now, while retaining its pause and configured lineup memberships.
_Avoid_: Completed, deleted

**Rotation position**:
A watchlist's place in the global recency order. Watching an unwatched item or skipping moves it to the back; quiet watch, unwatch, pause, resume, and item additions, removals, or movements preserve its position. New watchlists enter at the back unpaused. A merge into an existing watchlist preserves the target's position and pause; a new merge target follows ordinary creation rules.
_Avoid_: Viewing history
