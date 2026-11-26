//! Destination rules from v1 `AdditionDestination.ts`.
//!
//! Custom order requires an explicit position. Release order accepts a missing
//! position and rejects anchors. A missing watchlist is `not_found`.

use super::super::ItemOrderMode;

pub const INSERTION_CHOICE_MESSAGE: &str = "Choose where to insert this item in the custom order.";
pub const NOT_CUSTOM_MODE_MESSAGE: &str = "Anchored insertion is only available in custom mode.";
pub const WATCHLIST_NOT_FOUND_MESSAGE: &str = "Watchlist not found.";

/// Where new items land in a custom-ordered watchlist.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InsertionPosition {
    Beginning,
    End,
    Before,
    After,
}

impl InsertionPosition {
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "beginning" => Self::Beginning,
            "end" => Self::End,
            "before" => Self::Before,
            "after" => Self::After,
            _ => return None,
        })
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Beginning => "beginning",
            Self::End => "end",
            Self::Before => "before",
            Self::After => "after",
        }
    }

    pub fn is_anchor(self) -> bool {
        matches!(self, Self::Before | Self::After)
    }
}

/// Destination failures that happen before any provider call.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DestinationFailure {
    NotFound,
    InsertionChoiceRequired,
    NotCustomMode,
}

impl DestinationFailure {
    pub fn code(self) -> &'static str {
        match self {
            Self::NotFound => "not_found",
            Self::InsertionChoiceRequired => "insertion_choice_required",
            Self::NotCustomMode => "not_custom_mode",
        }
    }

    pub fn message(self) -> &'static str {
        match self {
            Self::NotFound => WATCHLIST_NOT_FOUND_MESSAGE,
            Self::InsertionChoiceRequired => INSERTION_CHOICE_MESSAGE,
            Self::NotCustomMode => NOT_CUSTOM_MODE_MESSAGE,
        }
    }
}

/// `order_mode: None` means the watchlist row does not exist.
pub fn validate_addition_destination(
    order_mode: Option<ItemOrderMode>,
    position: Option<InsertionPosition>,
) -> Result<(), DestinationFailure> {
    let Some(order_mode) = order_mode else {
        return Err(DestinationFailure::NotFound);
    };
    match order_mode {
        ItemOrderMode::Custom => {
            if position.is_none() {
                Err(DestinationFailure::InsertionChoiceRequired)
            } else {
                Ok(())
            }
        }
        ItemOrderMode::Release => {
            if position.is_some_and(InsertionPosition::is_anchor) {
                Err(DestinationFailure::NotCustomMode)
            } else {
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_order_requires_a_position_and_release_rejects_anchors() {
        assert_eq!(
            validate_addition_destination(None, None),
            Err(DestinationFailure::NotFound)
        );
        assert_eq!(
            validate_addition_destination(Some(ItemOrderMode::Custom), None),
            Err(DestinationFailure::InsertionChoiceRequired)
        );
        assert_eq!(
            validate_addition_destination(
                Some(ItemOrderMode::Custom),
                Some(InsertionPosition::End)
            ),
            Ok(())
        );
        assert_eq!(
            validate_addition_destination(
                Some(ItemOrderMode::Release),
                Some(InsertionPosition::Before)
            ),
            Err(DestinationFailure::NotCustomMode)
        );
        assert_eq!(
            validate_addition_destination(Some(ItemOrderMode::Release), None),
            Ok(())
        );
        assert_eq!(
            validate_addition_destination(
                Some(ItemOrderMode::Release),
                Some(InsertionPosition::Beginning)
            ),
            Ok(())
        );
    }
}
