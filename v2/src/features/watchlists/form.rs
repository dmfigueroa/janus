//! Watchlist create/edit dialog form values shared by page rendering and
//! validation responses. Dialog behavior itself stays browser-side.

use super::WatchlistRecord;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchlistForm {
    pub mode: &'static str,
    pub watchlist_id: Option<i64>,
    pub action: String,
    pub title: &'static str,
    pub help: &'static str,
    pub submit_label: &'static str,
    pub name: String,
    pub description: String,
    pub item_order_mode: String,
    pub error: Option<String>,
}

impl WatchlistForm {
    pub fn create() -> Self {
        Self {
            mode: "create",
            watchlist_id: None,
            action: "/v2/watchlists".into(),
            title: "Create watchlist",
            help: "Create a new watchlist to track your movies and shows.",
            submit_label: "Create watchlist",
            name: String::new(),
            description: String::new(),
            item_order_mode: "release".into(),
            error: None,
        }
    }

    pub fn name_invalid(&self) -> bool {
        self.error.is_some()
    }

    pub fn release_selected(&self) -> bool {
        self.item_order_mode == "release"
    }

    pub fn custom_selected(&self) -> bool {
        self.item_order_mode == "custom"
    }

    pub fn missing(id: i64) -> Self {
        Self {
            watchlist_id: Some(id),
            action: format!("/v2/watchlists/{id}"),
            mode: "edit",
            title: "Edit watchlist",
            help: "Update your watchlist details.",
            submit_label: "Save changes",
            name: String::new(),
            description: String::new(),
            item_order_mode: "release".into(),
            error: Some("Watchlist not found.".into()),
        }
    }

    pub fn edit(record: &WatchlistRecord) -> Self {
        Self {
            mode: "edit",
            watchlist_id: Some(record.id),
            action: format!("/v2/watchlists/{}", record.id),
            title: "Edit watchlist",
            help: "Update your watchlist details.",
            submit_label: "Save changes",
            name: record.name.clone(),
            description: record.description.clone().unwrap_or_default(),
            item_order_mode: record.item_order_mode.as_str().into(),
            error: None,
        }
    }
}
