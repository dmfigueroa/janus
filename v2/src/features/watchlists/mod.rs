use sea_orm::DatabaseConnection;

#[derive(Clone)]
pub struct Watchlists(pub DatabaseConnection);

pub use read_data::{
    ItemOrderMode, WatchlistDetail, WatchlistItem, WatchlistRecord, WatchlistStats,
    WatchlistSummary,
};

mod read_data;

pub mod web;

pub mod mcp;

pub mod discovery;

mod contracts;

mod validation;
