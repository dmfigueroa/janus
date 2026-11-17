//! Stored watchlist item order: the persisted order mode and the SQL that
//! reproduces its ordering. Read snapshots and reorder both use this module.

use sea_orm::DbErr;

/// Stored `item_order_mode`, validated at startup to be one of two values.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemOrderMode {
    Release,
    Custom,
}

impl ItemOrderMode {
    /// Decodes a stored `item_order_mode` value.
    ///
    /// # Errors
    ///
    /// Returns [`DbErr`] when the stored text is neither `release` nor `custom`.
    pub(super) fn from_stored(value: &str) -> Result<Self, DbErr> {
        match value {
            "release" => Ok(Self::Release),
            "custom" => Ok(Self::Custom),
            unknown => Err(DbErr::Custom(format!(
                "Unsupported watchlist item order mode: {unknown}"
            ))),
        }
    }

    /// Parses an order mode supplied by a web or MCP caller.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "release" => Some(Self::Release),
            "custom" => Some(Self::Custom),
            _ => None,
        }
    }

    /// The stored value for this mode.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Release => "release",
            Self::Custom => "custom",
        }
    }

    /// The `ORDER BY` expression for this mode's stored item order.
    pub(super) fn order_sql(self) -> &'static str {
        match self {
            Self::Release => {
                "CASE WHEN release_date IS NULL OR release_date='' THEN 1 ELSE 0 END,release_date,id"
            }
            Self::Custom => {
                "custom_rank IS NULL,custom_rank,CASE WHEN release_date IS NULL OR release_date='' THEN 1 ELSE 0 END,release_date,id"
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_order_mode_decodes_release_and_custom() {
        assert_eq!(
            ItemOrderMode::from_stored("release").unwrap(),
            ItemOrderMode::Release
        );
        assert_eq!(
            ItemOrderMode::from_stored("custom").unwrap(),
            ItemOrderMode::Custom
        );
    }

    #[test]
    fn item_order_mode_rejects_unknown_stored_values() {
        let error = ItemOrderMode::from_stored("sideways").unwrap_err();
        assert!(
            error
                .to_string()
                .contains("Unsupported watchlist item order mode: sideways"),
            "{error}"
        );
    }

    #[test]
    fn custom_order_keeps_null_ranks_last_and_falls_back_to_release_date_and_id() {
        let order = ItemOrderMode::Custom.order_sql();
        assert!(
            order.starts_with("custom_rank IS NULL,custom_rank"),
            "{order}"
        );
        assert!(order.ends_with("release_date,id"), "{order}");
    }
}
