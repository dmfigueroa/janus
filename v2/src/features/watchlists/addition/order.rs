//! Custom-order insertion, ported from v1 `InsertionOrder` and `OrderSplice`.
//!
//! Pending items are release-sorted, then spliced one at a time. A repeated
//! anchor trails the previous sibling. Ranks are rewritten as 1-based positions.

use super::destination::InsertionPosition;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct StoredOrderItem {
    pub(super) id: i64,
    pub(super) tmdb_id: String,
    pub(super) media_type: String,
    pub(super) release_date: Option<String>,
    pub(super) custom_rank: Option<i64>,
}

#[derive(Clone, Debug)]
pub(super) struct PendingInsert {
    pub(super) tmdb_id: String,
    pub(super) media_type: String,
    pub(super) release_date: Option<String>,
}

pub(super) struct RankedInsert {
    pub(super) pending_index: usize,
    pub(super) rank: i64,
}

pub(super) struct RankUpdate {
    pub(super) id: i64,
    pub(super) rank: i64,
}

pub(super) enum CustomOrderPlan {
    Unchanged,
    InvalidReference {
        reference_item_id: Option<i64>,
    },
    Writes {
        inserts: Vec<RankedInsert>,
        updates: Vec<RankUpdate>,
    },
}

pub(super) fn plan_custom_order(
    existing: &[StoredOrderItem],
    pending: &[PendingInsert],
    position: InsertionPosition,
    reference_item_id: Option<i64>,
) -> CustomOrderPlan {
    let pending_indexes = deduped_indexes(existing, pending);
    if pending_indexes.is_empty() {
        return CustomOrderPlan::Unchanged;
    }
    let ordered = release_order(pending, &pending_indexes);
    let mut slots: Vec<Slot> = existing
        .iter()
        .map(|item| Slot::Existing {
            id: item.id,
            custom_rank: item.custom_rank,
        })
        .collect();
    let mut last_anchor: Option<(String, usize)> = None;
    for pending_index in ordered {
        let anchor_key = anchor_key(position, reference_item_id);
        let splice_at = match splice_index(
            &slots,
            position,
            reference_item_id,
            anchor_key.as_deref(),
            last_anchor.as_ref(),
        ) {
            Ok(index) => index,
            Err(reference_item_id) => {
                return CustomOrderPlan::InvalidReference { reference_item_id };
            }
        };
        slots.insert(splice_at, Slot::Pending(pending_index));
        if let Some(key) = anchor_key {
            last_anchor = Some((key, splice_at));
        }
    }
    assign_ranks(&slots)
}

fn deduped_indexes(existing: &[StoredOrderItem], pending: &[PendingInsert]) -> Vec<usize> {
    let mut seen = existing
        .iter()
        .map(|item| item_key(&item.tmdb_id, &item.media_type))
        .collect::<std::collections::HashSet<_>>();
    pending
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let key = item_key(&item.tmdb_id, &item.media_type);
            seen.insert(key).then_some(index)
        })
        .collect()
}

fn item_key(tmdb_id: &str, media_type: &str) -> String {
    format!("{tmdb_id}::{media_type}")
}

fn release_order(pending: &[PendingInsert], indexes: &[usize]) -> Vec<usize> {
    let mut ordered = indexes.to_vec();
    ordered.sort_by(|left, right| {
        compare_release(
            pending[*left].release_date.as_deref(),
            *left,
            pending[*right].release_date.as_deref(),
            *right,
        )
    });
    ordered
}

fn compare_release(
    left_date: Option<&str>,
    left_index: usize,
    right_date: Option<&str>,
    right_index: usize,
) -> std::cmp::Ordering {
    let left = normalized_date(left_date);
    let right = normalized_date(right_date);
    match (left, right) {
        (None, None) => left_index.cmp(&right_index),
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (Some(_), None) => std::cmp::Ordering::Less,
        (Some(left), Some(right)) => left.cmp(right).then(left_index.cmp(&right_index)),
    }
}

fn normalized_date(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

enum Slot {
    Existing { id: i64, custom_rank: Option<i64> },
    Pending(usize),
}

fn anchor_key(position: InsertionPosition, reference_item_id: Option<i64>) -> Option<String> {
    if position.is_anchor() {
        reference_item_id.map(|id| format!("{}:{id}", position.as_str()))
    } else {
        None
    }
}

fn splice_index(
    slots: &[Slot],
    position: InsertionPosition,
    reference_item_id: Option<i64>,
    anchor_key: Option<&str>,
    last_anchor: Option<&(String, usize)>,
) -> Result<usize, Option<i64>> {
    if let Some(key) = anchor_key
        && let Some((last_key, last_index)) = last_anchor
        && last_key == key
    {
        return Ok(last_index + 1);
    }
    match position {
        InsertionPosition::Beginning => Ok(0),
        InsertionPosition::End => Ok(slots.len()),
        InsertionPosition::Before => reference_index(slots, reference_item_id),
        InsertionPosition::After => {
            reference_index(slots, reference_item_id).map(|index| index + 1)
        }
    }
}

fn reference_index(slots: &[Slot], reference_item_id: Option<i64>) -> Result<usize, Option<i64>> {
    let Some(reference_item_id) = reference_item_id else {
        return Err(None);
    };
    slots
        .iter()
        .position(|slot| {
            matches!(
                slot,
                Slot::Existing {
                    id,
                    custom_rank: Some(_),
                } if *id == reference_item_id
            )
        })
        .ok_or(Some(reference_item_id))
}

fn assign_ranks(slots: &[Slot]) -> CustomOrderPlan {
    let mut inserts = Vec::new();
    let mut updates = Vec::new();
    for (offset, slot) in slots.iter().enumerate() {
        let rank = (offset + 1) as i64;
        match slot {
            Slot::Pending(index) => inserts.push(RankedInsert {
                pending_index: *index,
                rank,
            }),
            Slot::Existing { id, .. } => updates.push(RankUpdate { id: *id, rank }),
        }
    }
    CustomOrderPlan::Writes { inserts, updates }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stored(id: i64, rank: Option<i64>) -> StoredOrderItem {
        StoredOrderItem {
            id,
            tmdb_id: format!("existing-{id}"),
            media_type: "movie".into(),
            release_date: None,
            custom_rank: rank,
        }
    }

    fn pending(id: &str, release_date: Option<&str>) -> PendingInsert {
        PendingInsert {
            tmdb_id: id.into(),
            media_type: "movie".into(),
            release_date: release_date.map(str::to_owned),
        }
    }

    fn inserted_ids(plan: &CustomOrderPlan, pending: &[PendingInsert]) -> Vec<String> {
        match plan {
            CustomOrderPlan::Writes { inserts, .. } => {
                let mut pairs: Vec<_> = inserts
                    .iter()
                    .map(|insert| (insert.rank, pending[insert.pending_index].tmdb_id.clone()))
                    .collect();
                pairs.sort_by_key(|(rank, _)| *rank);
                pairs.into_iter().map(|(_, id)| id).collect()
            }
            _ => panic!("expected writes"),
        }
    }

    #[test]
    fn beginning_places_the_new_item_first_and_renumbers() {
        let existing = vec![stored(10, Some(1)), stored(11, Some(2))];
        let pending = vec![pending("new", Some("2024-01-01"))];
        let plan = plan_custom_order(&existing, &pending, InsertionPosition::Beginning, None);
        let CustomOrderPlan::Writes { inserts, updates } = plan else {
            panic!("expected writes");
        };
        assert_eq!(inserts[0].rank, 1);
        assert_eq!(updates[0].rank, 2);
        assert_eq!(updates[1].rank, 3);
    }

    #[test]
    fn before_and_after_anchor_on_a_ranked_item() {
        let existing = vec![stored(10, Some(1)), stored(11, Some(2))];
        let pending = vec![pending("new", None)];
        let before = plan_custom_order(&existing, &pending, InsertionPosition::Before, Some(11));
        assert_eq!(inserted_ids(&before, &pending), ["new"]);
        let CustomOrderPlan::Writes { inserts, .. } = before else {
            panic!("expected writes");
        };
        assert_eq!(inserts[0].rank, 2);

        let after = plan_custom_order(&existing, &pending, InsertionPosition::After, Some(11));
        let CustomOrderPlan::Writes { inserts, .. } = after else {
            panic!("expected writes");
        };
        assert_eq!(inserts[0].rank, 3);
    }

    #[test]
    fn missing_or_unranked_reference_is_invalid() {
        let existing = vec![stored(10, Some(1)), stored(12, None)];
        let pending = vec![pending("new", None)];
        assert!(matches!(
            plan_custom_order(&existing, &pending, InsertionPosition::Before, Some(99)),
            CustomOrderPlan::InvalidReference {
                reference_item_id: Some(99)
            }
        ));
        assert!(matches!(
            plan_custom_order(&existing, &pending, InsertionPosition::After, Some(12)),
            CustomOrderPlan::InvalidReference {
                reference_item_id: Some(12)
            }
        ));
    }

    #[test]
    fn siblings_keep_release_order_at_the_end_and_skip_duplicates() {
        let existing = vec![stored(10, Some(1))];
        let pending = vec![
            pending("later", Some("2024-05-01")),
            pending("earlier", Some("2020-01-01")),
            pending("existing-10", None),
        ];
        let plan = plan_custom_order(&existing, &pending, InsertionPosition::End, None);
        assert_eq!(inserted_ids(&plan, &pending), ["earlier", "later"]);
    }

    #[test]
    fn repeated_beginning_splices_put_the_later_release_first() {
        let pending = vec![
            pending("earlier", Some("2020-01-01")),
            pending("later", Some("2024-05-01")),
        ];
        let plan = plan_custom_order(&[], &pending, InsertionPosition::Beginning, None);
        assert_eq!(inserted_ids(&plan, &pending), ["later", "earlier"]);
    }
}
