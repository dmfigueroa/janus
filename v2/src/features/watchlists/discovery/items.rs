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

pub(crate) const MEDIA_TYPES: &[&str] = &[
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
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum ItemSelector {
    Id(i64),
    Provider(ProviderIdentity),
    Text,
}

/// The three fields that together identify an item's provider entry.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ProviderIdentity {
    provider: String,
    provider_id: String,
    media_type: String,
}

impl ProviderIdentity {
    /// Builds the identity only when all three fields are present. Partial
    /// provider selections are invalid, so returning an `Option` here keeps
    /// the incomplete case out of the rest of validation.
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

impl ItemSelector {
    /// Resolves the exactly-one-of selector rules for a find request.
    fn parse(
        item_id: Option<i64>,
        provider: Option<ProviderIdentity>,
        has_query: bool,
        page_requested: bool,
    ) -> Result<Self, DiscoveryError> {
        let selector = match (item_id, provider, has_query) {
            (Some(id), None, false) => Self::Id(id),
            (None, Some(provider), false) => Self::Provider(provider),
            (None, None, true) => Self::Text,
            _ => return Err(invalid("Provide one valid watchlist item selector.")),
        };
        if selector.is_exact() && page_requested {
            return Err(invalid("Provide one valid watchlist item selector."));
        }
        Ok(selector)
    }

    fn is_exact(&self) -> bool {
        matches!(self, Self::Id(_) | Self::Provider(_))
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
        let watchlist_id = positive_id(watchlist_id, "watchlistId")?;
        let watchlist_item_id = positive_id(watchlist_item_id, "watchlistItemId")?;
        let page_requested = page_size.is_some() || cursor.is_some();
        let page = Page::new(page_size, cursor)?;
        let watchlist_id = watchlist_id.ok_or_else(|| invalid("Invalid watchlist ID."))?;
        let selector = if operation == DiscoveryOperation::Find {
            Some(ItemSelector::parse(
                watchlist_item_id,
                ProviderIdentity::parse(provider, provider_id, media_type)?,
                query.is_some(),
                page_requested,
            )?)
        } else {
            None
        };
        Ok(Self {
            operation,
            watchlist_id,
            selector,
            query,
            view,
            page,
        })
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
        let selected = select(stored, query.selector.as_ref(), query.query.as_deref());
        let paginated = !query.selector.as_ref().is_some_and(ItemSelector::is_exact);
        let (results, next_cursor) = if paginated {
            let binding = CursorBinding::Items {
                watchlist_id: query.watchlist_id,
                page_size: query.page.size(),
                query: query.query.clone(),
                titles: query.view == ResultView::Titles,
            };
            match query.view {
                ResultView::Items => {
                    let (page, cursor) = paginate(selected, &query.page, &binding)?;
                    (ItemResults::Items(page), cursor)
                }
                ResultView::Titles => {
                    let grouped = grouped_titles(&selected);
                    let (page, cursor) = paginate(grouped, &query.page, &binding)?;
                    (ItemResults::Titles(page), cursor)
                }
            }
        } else {
            match query.view {
                ResultView::Items => (ItemResults::Items(selected), None),
                ResultView::Titles => (
                    ItemResults::Titles(selected.iter().map(single_title).collect()),
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

fn select(
    items: Vec<WatchlistItem>,
    selector: Option<&ItemSelector>,
    query: Option<&str>,
) -> Vec<WatchlistItem> {
    match selector {
        None => items,
        Some(ItemSelector::Id(target)) => items
            .into_iter()
            .filter(|item| item.id == *target)
            .collect(),
        Some(ItemSelector::Provider(provider)) => items
            .into_iter()
            .filter(|item| {
                item.source == provider.provider
                    && item.tmdb_id == provider.provider_id
                    && item.media_type == provider.media_type
            })
            .collect(),
        Some(ItemSelector::Text) => {
            let query = query.unwrap_or_default().to_ascii_lowercase();
            items
                .into_iter()
                .filter(|item| item.matches_text(&query))
                .collect()
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn provider_identity() -> ProviderIdentity {
        ProviderIdentity {
            provider: "tmdb".into(),
            provider_id: "ep-1".into(),
            media_type: "episode".into(),
        }
    }

    #[test]
    fn selector_accepts_exactly_one_selector_shape() {
        assert!(matches!(
            ItemSelector::parse(Some(1), None, false, false),
            Ok(ItemSelector::Id(1))
        ));
        assert!(matches!(
            ItemSelector::parse(None, Some(provider_identity()), false, false),
            Ok(ItemSelector::Provider(ProviderIdentity { provider, .. })) if provider == "tmdb"
        ));
        assert!(matches!(
            ItemSelector::parse(None, None, true, false),
            Ok(ItemSelector::Text)
        ));
        for (item_id, provider, has_query) in [
            (Some(1), None, true),
            (Some(1), Some(provider_identity()), false),
            (None, Some(provider_identity()), true),
            (None, None, false),
        ] {
            assert!(
                matches!(
                    ItemSelector::parse(item_id, provider, has_query, false),
                    Err(DiscoveryError::InvalidInput(_))
                ),
                "expected a selector conflict for {item_id:?}, query={has_query}"
            );
        }
    }

    #[test]
    fn provider_selector_requires_every_identity_field() {
        assert!(matches!(
            ProviderIdentity::parse(None, None, None),
            Ok(None)
        ));
        for identity in [
            (Some("tmdb".to_owned()), None, None),
            (Some("tmdb".to_owned()), Some("ep-1".to_owned()), None),
            (None, Some("ep-1".to_owned()), Some("episode".to_owned())),
        ] {
            assert!(matches!(
                ProviderIdentity::parse(identity.0, identity.1, identity.2),
                Err(DiscoveryError::InvalidInput(_))
            ));
        }
    }

    #[test]
    fn exact_selector_rejects_page_requests() {
        assert!(matches!(
            ItemSelector::parse(Some(1), None, false, true),
            Err(DiscoveryError::InvalidInput(_))
        ));
        assert!(matches!(
            ItemSelector::parse(None, Some(provider_identity()), false, true),
            Err(DiscoveryError::InvalidInput(_))
        ));
        assert!(ItemSelector::parse(None, None, true, true).is_ok());
    }
}
