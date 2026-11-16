//! Item discovery: selectors, grouped titles, ordering and item pagination.
//!
//! Selectors are precedence-ordered exactly as before: an item ID, then a
//! provider identity, then free text. A watchlist item's grouped title is
//! its parent identity and title when present, otherwise its own.

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

#[derive(Clone, Debug, PartialEq)]
pub enum ItemResults {
    Items(Vec<WatchlistItem>),
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

const MEDIA_TYPES: &[&str] = &[
    "movie", "episode", "game", "book", "comic", "anime", "manga",
];

/// A validated item request, after transport-level normalization.
struct ItemQuery {
    operation: DiscoveryOperation,
    watchlist_id: i64,
    selector: Option<ItemSelector>,
    /// The trimmed text query, also used for cursor binding.
    query: Option<String>,
    view: ResultView,
    page: Page,
    paginated: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum ItemSelector {
    Id(i64),
    Provider {
        provider: String,
        provider_id: String,
        media_type: String,
    },
    Text,
}

impl ItemSelector {
    fn is_exact(&self) -> bool {
        matches!(self, Self::Id(_) | Self::Provider { .. })
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
        if operation.is_summary() {
            return Err(invalid("Invalid discovery operation."));
        }
        let view = ResultView::parse(request.result_view.as_deref())?;
        if request
            .media_type
            .as_deref()
            .is_some_and(|media_type| !MEDIA_TYPES.contains(&media_type))
        {
            return Err(invalid("Invalid mediaType."));
        }
        let query = trimmed_text(request.query, "query")?;
        let provider = trimmed_text(request.provider, "provider")?;
        let provider_id = trimmed_text(request.provider_id, "providerId")?;
        let watchlist_id = positive_id(request.watchlist_id, "watchlistId")?;
        let watchlist_item_id = positive_id(request.watchlist_item_id, "watchlistItemId")?;
        let page = Page::new(request.page_size, request.cursor.clone())?;
        let watchlist_id = watchlist_id.ok_or_else(|| invalid("Invalid watchlist ID."))?;
        let selector = if operation == DiscoveryOperation::Find {
            let provider_group =
                provider.is_some() || provider_id.is_some() || request.media_type.is_some();
            let selected = [watchlist_item_id.is_some(), provider_group, query.is_some()];
            let count = selected.iter().filter(|selected| **selected).count();
            let invalid_selector = count != 1
                || (provider_group
                    && (provider.is_none()
                        || provider_id.is_none()
                        || request.media_type.is_none()))
                || ((watchlist_item_id.is_some() || provider_group)
                    && (request.page_size.is_some() || request.cursor.is_some()));
            if invalid_selector {
                return Err(invalid("Provide one valid watchlist item selector."));
            }
            if let Some(target) = watchlist_item_id {
                Some(ItemSelector::Id(target))
            } else if let (Some(provider), Some(provider_id), Some(media_type)) =
                (provider, provider_id, request.media_type)
            {
                Some(ItemSelector::Provider {
                    provider,
                    provider_id,
                    media_type,
                })
            } else {
                Some(ItemSelector::Text)
            }
        } else {
            None
        };
        let paginated = !selector.as_ref().is_some_and(ItemSelector::is_exact);
        Ok(Self {
            operation,
            watchlist_id,
            selector,
            query,
            view,
            page,
            paginated,
        })
    }
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
        let query = ItemQuery::validate(operation, request)?;
        self.item_page(query).await
    }

    async fn item_page(&self, query: ItemQuery) -> Result<ItemPage, DiscoveryError> {
        let Some(WatchlistDetail {
            watchlist,
            items: stored,
            order_token,
        }) = self
            .detail(query.watchlist_id)
            .await
            .map_err(DiscoveryError::Database)?
        else {
            if query.selector.as_ref().is_some_and(ItemSelector::is_exact) {
                let results = match query.view {
                    ResultView::Items => ItemResults::Items(Vec::new()),
                    ResultView::Titles => ItemResults::Titles(Vec::new()),
                };
                return Ok(ItemPage {
                    watchlist: None,
                    results,
                    next_cursor: None,
                    order_token: None,
                });
            }
            return Err(invalid(format!(
                "Watchlist {} was not found.",
                query.watchlist_id
            )));
        };
        let selected = select(&stored, query.selector.as_ref(), query.query.as_deref());
        let (results, next_cursor) = if query.paginated {
            let binding = CursorBinding::Items {
                watchlist_id: query.watchlist_id,
                page_size: query.page.size(),
                query: query.query.clone(),
                titles: query.view == ResultView::Titles,
            };
            match query.view {
                ResultView::Items => {
                    let (page, cursor) = paginate(selected, &query.page, &binding)?;
                    (
                        ItemResults::Items(page.into_iter().cloned().collect()),
                        cursor,
                    )
                }
                ResultView::Titles => {
                    let grouped = grouped_titles(&selected);
                    let (page, cursor) = paginate(grouped, &query.page, &binding)?;
                    (ItemResults::Titles(page), cursor)
                }
            }
        } else {
            match query.view {
                ResultView::Items => (
                    ItemResults::Items(selected.into_iter().cloned().collect()),
                    None,
                ),
                ResultView::Titles => (
                    ItemResults::Titles(selected.iter().map(|item| single_title(item)).collect()),
                    None,
                ),
            }
        };
        let is_get = query.operation == DiscoveryOperation::Get;
        Ok(ItemPage {
            watchlist: is_get.then_some(watchlist),
            results,
            next_cursor,
            order_token: (is_get && query.view == ResultView::Items).then_some(order_token),
        })
    }
}

fn select<'a>(
    items: &'a [WatchlistItem],
    selector: Option<&ItemSelector>,
    query: Option<&str>,
) -> Vec<&'a WatchlistItem> {
    match selector {
        None => items.iter().collect(),
        Some(ItemSelector::Id(target)) => items.iter().filter(|item| item.id == *target).collect(),
        Some(ItemSelector::Provider {
            provider,
            provider_id,
            media_type,
        }) => items
            .iter()
            .filter(|item| {
                item.source == *provider
                    && item.tmdb_id == *provider_id
                    && item.media_type == *media_type
            })
            .collect(),
        Some(ItemSelector::Text) => {
            let query = query.unwrap_or_default().to_ascii_lowercase();
            items
                .iter()
                .filter(|item| item.matches_text(&query))
                .collect()
        }
    }
}

fn grouped_titles(items: &[&WatchlistItem]) -> Vec<GroupedTitle> {
    // Keys borrow from `items`, which outlives the grouping map.
    let mut grouped = BTreeMap::<(&str, &str, &str, &str), usize>::new();
    for item in items {
        let (id, title) = item.group_title();
        *grouped
            .entry((title, id, &item.source, &item.media_type))
            .or_default() += 1;
    }
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

fn single_title(item: &WatchlistItem) -> GroupedTitle {
    let (id, title) = item.group_title();
    GroupedTitle {
        source: item.source.clone(),
        provider_id: id.into(),
        media_type: item.media_type.clone(),
        title: title.into(),
        matching_item_count: 1,
    }
}
