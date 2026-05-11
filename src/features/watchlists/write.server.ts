import { addToWatchlistMutation } from "@/features/watchlists/add/mutation.server";
import { createWatchlistMutation } from "@/features/watchlists/create/mutation.server";
import { deleteWatchlistMutation } from "@/features/watchlists/delete/mutation.server";
import { mergeWatchlistsMutation } from "@/features/watchlists/merge/mutation.server";
import {
  updateWatchlistItemOrderModeMutation,
  type UpdateWatchlistItemOrderModeResult,
} from "@/features/watchlists/order-mode/mutation.server";
import { toggleWatchedMutation } from "@/features/watchlists/toggle/mutation.server";
import type {
  AddToWatchlistInput,
  CreateWatchlistInput,
  DeleteWatchlistInput,
  MergeWatchlistsInput,
  ToggleWatchedInput,
  UpdateWatchlistItemOrderModeInput,
} from "./mutations";

export const WatchlistsWrite = {
  async create(input: CreateWatchlistInput) {
    return createWatchlistMutation(input);
  },

  async delete({ id }: DeleteWatchlistInput) {
    return deleteWatchlistMutation({ id });
  },

  async merge({ targetWatchlistId, sourceWatchlistIds, newWatchlistName }: MergeWatchlistsInput) {
    return mergeWatchlistsMutation({
      targetWatchlistId,
      sourceWatchlistIds,
      newWatchlistName,
    });
  },

  async add({ watchlistId, media }: AddToWatchlistInput) {
    return addToWatchlistMutation({ watchlistId, media });
  },

  async toggleWatched({ itemId, isWatched }: ToggleWatchedInput) {
    return toggleWatchedMutation({ itemId, isWatched });
  },

  async updateItemOrderMode({
    watchlistId,
    itemOrderMode,
  }: UpdateWatchlistItemOrderModeInput): Promise<UpdateWatchlistItemOrderModeResult> {
    return updateWatchlistItemOrderModeMutation({ watchlistId, itemOrderMode });
  },
};
