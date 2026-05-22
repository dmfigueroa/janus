import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { Watchlist } from "@/db/schema";
import { createWatchlist } from "@/features/watchlists/create/mutation";
import { updateWatchlist } from "@/features/watchlists/update/mutation";
import { invalidateWatchlistQueries } from "@/features/watchlists/cache";

type UseWatchlistFormOptions =
  | { mode: "create"; watchlist?: never }
  | { mode: "edit"; watchlist: Watchlist };

export function useWatchlistForm({ mode, watchlist }: UseWatchlistFormOptions) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const createWatchlistFn = useServerFn(createWatchlist);
  const updateWatchlistFn = useServerFn(updateWatchlist);

  const isCreate = mode === "create";
  const title = isCreate ? "Create New List" : "Edit List";
  const submitLabel = isCreate ? "Create List" : "Save Changes";
  const descriptionLabel = isCreate
    ? "Create a new watchlist to track your movies and shows."
    : "Update your watchlist details.";

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const { name, description, itemOrderMode } = parseFormData(e.currentTarget);

    try {
      if (isCreate) {
        await createWatchlistFn({ data: { name, description, itemOrderMode } });
        toast.success("Watchlist created successfully");
      } else {
        const result = await updateWatchlistFn({
          data: {
            watchlistId: watchlist.id,
            name,
            description,
            itemOrderMode,
          },
        });

        if (!result.success) {
          throw new Error(result.message);
        }

        toast.success("Changes saved successfully");
      }

      setOpen(false);
      await router.invalidate?.();
      invalidateWatchlistQueries(queryClient);
    } catch (error) {
      console.error("Failed to save watchlist", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save watchlist. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    open,
    setOpen,
    loading,
    title,
    submitLabel,
    descriptionLabel,
    onSubmit,
  };
}

function parseFormData(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    name: data.get("name") as string,
    description: data.get("description") as string,
    itemOrderMode: data.get("itemOrderMode") as "release" | "custom",
  };
}
