//! Item discovery: selectors, grouped titles, ordering and item pagination.
//!
//! A get reads one watchlist and pages it. A find selects items by item ID,
//! provider identity or free text. Those are separate operations, so each has
//! its own validated query type and its own read path. Selector precedence is
//! unchanged: an item ID, then a provider identity, then free text. A
//! watchlist item's grouped title is its parent identity and title when
//! present, otherwise its own.

use super::{
    CursorBinding, DiscoveryError, DiscoveryOperation, DiscoveryRequest, Page, invalid, paginate,
    positive_id, trimmed_text,
};
use crate::features::watchlists::{WatchlistDetail, WatchlistItem, WatchlistSummary, Watchlists};
use std::collections::BTreeMap;

/// One page of discovered items or titles, ready for an adapter.
#[derive(Clone, Debug, PartialEq)]
pub struct ItemPage {
    /// Present only for a `Get` read.
    pub watchlist: Option<WatchlistSummary>,
    pub results: ItemResults,
    pub next_cursor: Option<String>,
    /// Present only for a `Get` read of items.
    pub order_token: Option<String>,
}

impl ItemPage {
    fn empty(view: ResultView) -> Self {
        let results = match view {
            ResultView::Items => ItemResults::Items(Vec::new()),
            ResultView::Titles => ItemResults::Titles(Vec::new()),
        };
        Self {
            watchlist: None,
            results,
            next_cursor: None,
            order_token: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum ItemResults {
    /// Stored items in discovery order.
    Items(Vec<WatchlistItem>),
    /// Distinct title identities with their matching item counts.
    Titles(Vec<GroupedTitle>),
}

/// A distinct title selected from a watchlist, with its matching item count.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GroupedTitle {
    pub source: String,
    pub provider_id: String,
    pub media_type: String,
    pub title: String,
    pub matching_item_count: usize,
}

pub(crate) const MEDIA_TYPES: &[&str] = &[
    "movie", "episode", "game", "book", "comic", "anime", "manga",
];

/// A validated item request, after transport-level normalization.
enum ItemQuery {
    Get(GetQuery),
    Find(FindQuery),
}

/// A whole-watchlist read. Every item participates and the page window applies.
struct GetQuery {
    watchlist_id: i64,
    view: ResultView,
    page: Page,
}

/// A selector read. Exact selectors return every match without a page window;
/// text selectors filter and paginate.
enum FindQuery {
    Exact {
        watchlist_id: i64,
        selector: ExactSelector,
        view: ResultView,
    },
    Text {
        watchlist_id: i64,
        query: String,
        view: ResultView,
        page: Page,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum ExactSelector {
    Id(i64),
    Provider(ProviderIdentity),
}

/// The three fields that together identify an item's provider entry.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ProviderIdentity {
    provider: String,
    provider_id: String,
    media_type: String,
}

impl ProviderIdentity {
    /// Returns `None` only when no provider field is present. A partial
    /// selection is invalid, so the incomplete case never reaches selection.
    fn parse(
        provider: Option<String>,
        provider_id: Option<String>,
        media_type: Option<String>,
    ) -> Result<Option<Self>, DiscoveryError> {
        match (provider, provider_id, media_type) {
            (None, None, None) => Ok(None),
            (Some(provider), Some(provider_id), Some(media_type)) => Ok(Some(Self {
                provider,
                provider_id,
                media_type,
            })),
            _ => Err(invalid("Provide one valid watchlist item selector.")),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ResultView {
    Items,
    Titles,
}

impl ResultView {
    fn parse(value: Option<&str>) -> Result<Self, DiscoveryError> {
        match value.unwrap_or("items") {
            "items" => Ok(Self::Items),
            "titles" => Ok(Self::Titles),
            _ => Err(invalid("Invalid resultView.")),
        }
    }
}

impl ItemQuery {
    fn validate(
        operation: DiscoveryOperation,
        request: DiscoveryRequest,
    ) -> Result<Self, DiscoveryError> {
        match operation {
            DiscoveryOperation::Get => Ok(Self::Get(GetQuery::validate(request)?)),
            DiscoveryOperation::Find => Ok(Self::Find(FindQuery::validate(request)?)),
            DiscoveryOperation::List | DiscoveryOperation::Search => {
                Err(invalid("Invalid discovery operation."))
            }
        }
    }
}

impl GetQuery {
    fn validate(request: DiscoveryRequest) -> Result<Self, DiscoveryError> {
        let DiscoveryRequest {
            page_size,
            cursor,
            watchlist_id,
            result_view,
            ..
        } = request;
        Ok(Self {
            view: ResultView::parse(result_view.as_deref())?,
            watchlist_id: required_watchlist_id(watchlist_id)?,
            page: Page::new(page_size, cursor)?,
        })
    }
}

impl FindQuery {
    fn validate(request: DiscoveryRequest) -> Result<Self, DiscoveryError> {
        let DiscoveryRequest {
            query,
            page_size,
            cursor,
            watchlist_id,
            watchlist_item_id,
            provider,
            provider_id,
            media_type,
            result_view,
            ..
        } = request;
        let view = ResultView::parse(result_view.as_deref())?;
        let media_type = validated_media_type(media_type)?;
        let query = trimmed_text(query, "query")?;
        let provider = trimmed_text(provider, "provider")?;
        let provider_id = trimmed_text(provider_id, "providerId")?;
        let item_id = positive_id(watchlist_item_id, "watchlistItemId")?;
        let watchlist_id = required_watchlist_id(watchlist_id)?;
        let provider_identity = ProviderIdentity::parse(provider, provider_id, media_type)?;
        let page_requested = page_size.is_some() || cursor.is_some();
        match (item_id, provider_identity, query, page_requested) {
            (Some(item_id), None, None, false) => Ok(Self::Exact {
                watchlist_id,
                selector: ExactSelector::Id(item_id),
                view,
            }),
            (None, Some(provider), None, false) => Ok(Self::Exact {
                watchlist_id,
                selector: ExactSelector::Provider(provider),
                view,
            }),
            (None, None, Some(query), _) => Ok(Self::Text {
                watchlist_id,
                query,
                view,
                page: Page::new(page_size, cursor)?,
            }),
            _ => Err(invalid("Provide one valid watchlist item selector.")),
        }
    }
}

fn validated_media_type(media_type: Option<String>) -> Result<Option<String>, DiscoveryError> {
    match media_type {
        Some(media_type) if !MEDIA_TYPES.contains(&media_type.as_str()) => {
            Err(invalid("Invalid mediaType."))
        }
        media_type => Ok(media_type),
    }
}

fn required_watchlist_id(watchlist_id: Option<i64>) -> Result<i64, DiscoveryError> {
    positive_id(watchlist_id, "watchlistId")?.ok_or_else(|| invalid("Invalid watchlist ID."))
}

impl Watchlists {
    /// Typed item discovery for callers that own their protocol projection.
    ///
    /// # Errors
    ///
    /// Returns [`DiscoveryError`] for invalid input, a missing watchlist or a
    /// failed database read.
    pub async fn items(
        &self,
        operation: DiscoveryOperation,
        request: DiscoveryRequest,
    ) -> Result<ItemPage, DiscoveryError> {
        match ItemQuery::validate(operation, request)? {
            ItemQuery::Get(query) => self.get_items(query).await,
            ItemQuery::Find(query) => self.find_items(query).await,
        }
    }

    async fn get_items(&self, query: GetQuery) -> Result<ItemPage, DiscoveryError> {
        let watchlist_id = query.watchlist_id;
        let Some(WatchlistDetail {
            watchlist,
            items,
            order_token,
        }) = self
            .detail(watchlist_id)
            .await
            .map_err(DiscoveryError::Database)?
        else {
            return Err(watchlist_not_found(watchlist_id));
        };
        let binding = CursorBinding::Items {
            watchlist_id,
            page_size: query.page.size(),
            query: None,
            titles: query.view == ResultView::Titles,
        };
        let (results, next_cursor) = match query.view {
            ResultView::Items => {
                let (items, cursor) = paginate(items, &query.page, &binding)?;
                (ItemResults::Items(items), cursor)
            }
            ResultView::Titles => {
                let grouped = grouped_titles(&items);
                let (titles, cursor) = paginate(grouped, &query.page, &binding)?;
                (ItemResults::Titles(titles), cursor)
            }
        };
        Ok(ItemPage {
            watchlist: Some(watchlist),
            results,
            next_cursor,
            order_token: (query.view == ResultView::Items).then_some(order_token),
        })
    }

    async fn find_items(&self, query: FindQuery) -> Result<ItemPage, DiscoveryError> {
        match query {
            FindQuery::Exact {
                watchlist_id,
                selector,
                view,
            } => {
                let Some(WatchlistDetail { items, .. }) = self
                    .detail(watchlist_id)
                    .await
                    .map_err(DiscoveryError::Database)?
                else {
                    return Ok(ItemPage::empty(view));
                };
                let selected = select_exact(items, selector);
                let results = match view {
                    ResultView::Items => ItemResults::Items(selected),
                    ResultView::Titles => ItemResults::Titles(grouped_titles(&selected)),
                };
                Ok(ItemPage {
                    watchlist: None,
                    results,
                    next_cursor: None,
                    order_token: None,
                })
            }
            FindQuery::Text {
                watchlist_id,
                query,
                view,
                page,
            } => {
                let Some(WatchlistDetail { items, .. }) = self
                    .detail(watchlist_id)
                    .await
                    .map_err(DiscoveryError::Database)?
                else {
                    return Err(watchlist_not_found(watchlist_id));
                };
                let selected = filter_text(items, &query);
                let binding = CursorBinding::Items {
                    watchlist_id,
                    page_size: page.size(),
                    query: Some(query),
                    titles: view == ResultView::Titles,
                };
                let (results, next_cursor) = match view {
                    ResultView::Items => {
                        let (items, cursor) = paginate(selected, &page, &binding)?;
                        (ItemResults::Items(items), cursor)
                    }
                    ResultView::Titles => {
                        let grouped = grouped_titles(&selected);
                        let (titles, cursor) = paginate(grouped, &page, &binding)?;
                        (ItemResults::Titles(titles), cursor)
                    }
                };
                Ok(ItemPage {
                    watchlist: None,
                    results,
                    next_cursor,
                    order_token: None,
                })
            }
        }
    }
}

fn watchlist_not_found(watchlist_id: i64) -> DiscoveryError {
    invalid(format!("Watchlist {watchlist_id} was not found."))
}

fn select_exact(items: Vec<WatchlistItem>, selector: ExactSelector) -> Vec<WatchlistItem> {
    match selector {
        ExactSelector::Id(target) => items.into_iter().filter(|item| item.id == target).collect(),
        ExactSelector::Provider(provider) => items
            .into_iter()
            .filter(|item| {
                item.source == provider.provider
                    && (item.tmdb_id == provider.provider_id
                        || item.parent_id.as_deref() == Some(provider.provider_id.as_str()))
                    && item.media_type == provider.media_type
            })
            .collect(),
    }
}

fn filter_text(items: Vec<WatchlistItem>, query: &str) -> Vec<WatchlistItem> {
    let query = query.to_ascii_lowercase();
    items
        .into_iter()
        .filter(|item| item.matches_text(&query))
        .collect()
}

fn grouped_titles(items: &[WatchlistItem]) -> Vec<GroupedTitle> {
    // Keys borrow from `items`, which outlives the grouping map.
    let grouped = items.iter().fold(
        BTreeMap::<(&str, &str, &str, &str), usize>::new(),
        |mut grouped, item| {
            let (id, title) = item.group_title();
            *grouped
                .entry((title, id, &item.source, &item.media_type))
                .or_default() += 1;
            grouped
        },
    );
    grouped
        .into_iter()
        .map(
            |((title, id, source, media_type), matching_item_count)| GroupedTitle {
                source: source.into(),
                provider_id: id.into(),
                media_type: media_type.into(),
                title: title.into(),
                matching_item_count,
            },
        )
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn find_request() -> DiscoveryRequest {
        DiscoveryRequest {
            watchlist_id: Some(41),
            ..Default::default()
        }
    }

    fn validate_find(request: DiscoveryRequest) -> Result<ItemQuery, DiscoveryError> {
        ItemQuery::validate(DiscoveryOperation::Find, request)
    }

    #[test]
    fn selector_accepts_exactly_one_selector_shape() {
        let by_id = validate_find(DiscoveryRequest {
            watchlist_item_id: Some(101),
            ..find_request()
        })
        .unwrap();
        assert!(matches!(
            by_id,
            ItemQuery::Find(FindQuery::Exact {
                selector: ExactSelector::Id(101),
                ..
            })
        ));

        let by_provider = validate_find(DiscoveryRequest {
            provider: Some("tmdb".into()),
            provider_id: Some("ep-1".into()),
            media_type: Some("episode".into()),
            ..find_request()
        })
        .unwrap();
        assert!(matches!(
            by_provider,
            ItemQuery::Find(FindQuery::Exact {
                selector: ExactSelector::Provider(ProviderIdentity { provider, .. }),
                ..
            }) if provider == "tmdb"
        ));

        let by_text = validate_find(DiscoveryRequest {
            query: Some("show".into()),
            ..find_request()
        })
        .unwrap();
        assert!(matches!(
            by_text,
            ItemQuery::Find(FindQuery::Text { query, .. }) if query == "show"
        ));

        for request in [
            DiscoveryRequest {
                watchlist_item_id: Some(101),
                query: Some("show".into()),
                ..find_request()
            },
            DiscoveryRequest {
                watchlist_item_id: Some(101),
                provider: Some("tmdb".into()),
                provider_id: Some("ep-1".into()),
                media_type: Some("episode".into()),
                ..find_request()
            },
            DiscoveryRequest {
                provider: Some("tmdb".into()),
                provider_id: Some("ep-1".into()),
                media_type: Some("episode".into()),
                query: Some("show".into()),
                ..find_request()
            },
            find_request(),
        ] {
            assert!(
                matches!(validate_find(request), Err(DiscoveryError::InvalidInput(_))),
                "expected a selector conflict"
            );
        }
    }

    #[test]
    fn provider_selector_requires_every_identity_field() {
        for request in [
            DiscoveryRequest {
                provider: Some("tmdb".into()),
                ..find_request()
            },
            DiscoveryRequest {
                provider: Some("tmdb".into()),
                provider_id: Some("ep-1".into()),
                ..find_request()
            },
            DiscoveryRequest {
                provider_id: Some("ep-1".into()),
                media_type: Some("episode".into()),
                ..find_request()
            },
        ] {
            assert!(matches!(
                validate_find(request),
                Err(DiscoveryError::InvalidInput(_))
            ));
        }
    }

    #[test]
    fn exact_selector_rejects_page_requests() {
        assert!(matches!(
            validate_find(DiscoveryRequest {
                watchlist_item_id: Some(101),
                page_size: Some(1),
                ..find_request()
            }),
            Err(DiscoveryError::InvalidInput(_))
        ));
        assert!(matches!(
            validate_find(DiscoveryRequest {
                provider: Some("tmdb".into()),
                provider_id: Some("ep-1".into()),
                media_type: Some("episode".into()),
                cursor: Some("cursor".into()),
                ..find_request()
            }),
            Err(DiscoveryError::InvalidInput(_))
        ));
        assert!(
            validate_find(DiscoveryRequest {
                query: Some("show".into()),
                page_size: Some(1),
                ..find_request()
            })
            .is_ok()
        );
    }

    #[test]
    fn get_accepts_any_positive_watchlist_id() {
        let query = ItemQuery::validate(
            DiscoveryOperation::Get,
            DiscoveryRequest {
                watchlist_id: Some(41),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(matches!(
            query,
            ItemQuery::Get(GetQuery {
                watchlist_id: 41,
                ..
            })
        ));
    }
}
