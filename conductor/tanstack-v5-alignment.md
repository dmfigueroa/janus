# TanStack v5 Best Practices Alignment Plan

## Objective

The codebase's watchlist optimistic updates have already been refactored to align with TanStack Query v5 best practices (centralized query key factories, `infiniteQueryOptions`, strict separation of pure cache transformations from side-effect orchestration). This plan confirms that these patterns will be applied and verified across the relevant components, and specifies any minor outstanding alignment tasks.

## Key Actions & Verifications

1.  **Verify existing alignment:** Ensure that `useItemOrderModeMutation` and `useToggleWatchedItem` are correctly utilizing the newly split `cache.ts` and `transform.ts` modules. This was largely completed in the previous step.
2.  **No further major refactors required:** The evaluation confirmed that our approach to "Query Key Factories," `queryOptions` usage, and optimistic rollback lifecycles in `src/features/watchlists/detail/` represents the "gold standard" for v5.
3.  **Future-proofing:** The architectural decision to keep complex `InfiniteData` transformations pure (as seen in `repartitionItemsAcrossPages`) effectively mitigates the risks highlighted by the TanStack documentation regarding manual cache manipulation.

## Next Steps

Since the actual structural changes were performed prior to this review phase, I will simply confirm that all tests pass and no further code changes are needed to meet the user's request.
