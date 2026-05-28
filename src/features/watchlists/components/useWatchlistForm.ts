import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { Watchlist } from "@/db/schema";
import { type WatchlistItemOrderMode } from "@/features/watchlists/order";
import { createWatchlist } from "@/features/watchlists/create/mutation";
import { updateWatchlist } from "@/features/watchlists/update/mutation";
import { invalidateWatchlistQueries } from "@/features/watchlists/cache";

type UseWatchlistFormOptions =
  | { mode: "create"; watchlist?: never; onSuccess?: () => void }
  | { mode: "edit"; watchlist: Watchlist; onSuccess?: () => void };

export function useWatchlistForm({ mode, watchlist, onSuccess }: UseWatchlistFormOptions) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const createWatchlistFn = useServerFn(createWatchlist);
  const updateWatchlistFn = useServerFn(updateWatchlist);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = parseFormData(e.currentTarget);
      await submitWatchlist({
        mode,
        watchlist,
        formData,
        createFn: createWatchlistFn,
        updateFn: updateWatchlistFn,
      });
      handleSubmitSuccess({ mode, router, queryClient });
      onSuccess?.();
    } catch (error) {
      handleSubmitError(error);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    onSubmit,
  };
}

// --- Submission layer ---

type SubmitArgs = {
  mode: "create" | "edit";
  watchlist: Watchlist | undefined;
  formData: ReturnType<typeof parseFormData>;
  createFn: ReturnType<typeof useServerFn<typeof createWatchlist>>;
  updateFn: ReturnType<typeof useServerFn<typeof updateWatchlist>>;
};

async function submitWatchlist({ mode, watchlist, formData, createFn, updateFn }: SubmitArgs) {
  if (mode === "create") {
    await createFn({ data: formData });
    return;
  }

  if (!watchlist) {
    throw new Error("Watchlist is required for edit mode");
  }

  const result = await updateFn({
    data: {
      watchlistId: watchlist.id,
      ...formData,
    },
  });

  if (!result.success) {
    throw new Error(result.message);
  }
}

// --- Side-effect layer ---

type SuccessContext = {
  mode: "create" | "edit";
  router: ReturnType<typeof useRouter>;
  queryClient: ReturnType<typeof useQueryClient>;
};

async function handleSubmitSuccess({ mode, router, queryClient }: SuccessContext) {
  toast.success(
    mode === "create" ? "Watchlist created successfully" : "Changes saved successfully",
  );
  await router.invalidate?.();
  invalidateWatchlistQueries(queryClient);
}

function handleSubmitError(error: unknown) {
  console.error("Failed to save watchlist", error);
  toast.error(
    error instanceof Error ? error.message : "Failed to save watchlist. Please try again.",
  );
}

// --- Parsing layer ---

function parseFormData(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    name: data.get("name") as string,
    description: data.get("description") as string,
    itemOrderMode: data.get("itemOrderMode") as WatchlistItemOrderMode,
  };
}
