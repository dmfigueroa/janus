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
The global recency order used to surface what to watch next. A watchlist leaves the rotation while it is paused or completed, and returns automatically once neither applies.
_Avoid_: Active queue, cycle

**Lineup**:
A named grouping of watchlists on Watch Now. Automatic lineups group by the next unwatched item's media type; custom lineups contain explicitly selected watchlists. All lineups share the global rotation, and paused, completed, or empty members remain configured but are not eligible for display.
_Avoid_: Separate rotation, independent viewing history

**Paused**:
The persisted on/off state that removes a watchlist from the rotation without deleting it. Pausing records when the pause began; resuming clears it and returns the list to its previous position in the rotation.
_Avoid_: Archived, hidden, snoozed

**Completed**:
The derived state of a watchlist whose items are all watched (progress is 100%). It is never stored; adding a new item un-completes the list automatically.
_Avoid_: Finished, done, watched
