import { useEffect } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { Watchlist } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { createWatchlist } from "@/features/watchlists/create/Mutation";
import { updateWatchlist } from "@/features/watchlists/update/Mutation";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";

type UseWatchlistFormOptions =
  | { mode: "create"; watchlist?: never; onSuccess?: () => void; open?: boolean }
  | { mode: "edit"; watchlist: Watchlist; onSuccess?: () => void; open?: boolean };

export type WatchlistFormValues = {
  name: string;
  description: string;
  itemOrderMode: WatchlistItemOrderMode;
};

export function useWatchlistForm({
  mode,
  watchlist,
  onSuccess,
  open = false,
}: UseWatchlistFormOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const createWatchlistFn = useServerFn(createWatchlist);
  const updateWatchlistFn = useServerFn(updateWatchlist);
  const form = useForm<WatchlistFormValues>({
    defaultValues: getDefaultValues(watchlist),
  });

  useEffect(() => {
    if (open) {
      form.reset(getDefaultValues(watchlist));
    }
  }, [form, open, watchlist]);

  const onSubmit: SubmitHandler<WatchlistFormValues> = async (formData) => {
    try {
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
    }
  };

  return {
    ...form,
    loading: form.formState.isSubmitting,
    onSubmit: form.handleSubmit(onSubmit),
  };
}

// --- Submission layer ---

type SubmitArgs = {
  mode: "create" | "edit";
  watchlist: Watchlist | undefined;
  formData: WatchlistFormValues;
  createFn: ReturnType<typeof useServerFn<typeof createWatchlist>>;
  updateFn: ReturnType<typeof useServerFn<typeof updateWatchlist>>;
};

async function submitWatchlist({ mode, watchlist, formData, createFn, updateFn }: SubmitArgs) {
  if (mode === "create") {
    await submitNewWatchlist(createFn, formData);
    return;
  }

  await submitWatchlistUpdate(updateFn, watchlist, formData);
}

async function submitNewWatchlist(
  createFn: SubmitArgs["createFn"],
  formData: SubmitArgs["formData"],
) {
  await createFn({ data: formData });
}

async function submitWatchlistUpdate(
  updateFn: SubmitArgs["updateFn"],
  watchlist: Watchlist | undefined,
  formData: SubmitArgs["formData"],
) {
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

function getDefaultValues(watchlist: Watchlist | undefined): WatchlistFormValues {
  return watchlist
    ? {
        name: watchlist.name,
        description: watchlist.description ?? "",
        itemOrderMode: watchlist.itemOrderMode,
      }
    : { name: "", description: "", itemOrderMode: "release" };
}
