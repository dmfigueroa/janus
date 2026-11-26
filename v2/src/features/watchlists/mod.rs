use sea_orm::DatabaseConnection;

#[derive(Clone)]
pub struct Watchlists(pub DatabaseConnection);

pub use item_order::ItemOrderMode;
pub use snapshot::{WatchlistDetail, WatchlistItem, WatchlistRecord};
pub use summary::{WatchlistStats, WatchlistSummary};

mod item_order;
mod snapshot;
mod storage;
mod summary;

pub mod web;

pub mod mcp;

pub mod discovery;

mod browse;

mod dialog;

mod item_dialog;

pub mod reorder;

mod timeline;

mod write;
