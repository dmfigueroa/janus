import { useEffect } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { toaster } from "@/app/Toaster";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { Watchlist } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { createWatchlist as createWatchlistServerFn } from "@/features/watchlists/create/Mutation";
import { updateWatchlist as updateWatchlistServerFn } from "@/features/watchlists/update/Mutation";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";

export type UseWatchlistFormOptions =
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
  const createWatchlistFn = useServerFn(createWatchlistServerFn);
  const updateWatchlistFn = useServerFn(updateWatchlistServerFn);

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
      await saveWatchlist({
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

type SubmitArgs = {
  mode: "create" | "edit";
  watchlist: Watchlist | undefined;
  formData: WatchlistFormValues;
  createFn: ReturnType<typeof useServerFn<typeof createWatchlistServerFn>>;
  updateFn: ReturnType<typeof useServerFn<typeof updateWatchlistServerFn>>;
};

async function saveWatchlist({ mode, watchlist, formData, createFn, updateFn }: SubmitArgs) {
  if (mode === "create") {
    await createFn({ data: formData });
    return;
  }

  await updateWatchlist(updateFn, watchlist, formData);
}

async function updateWatchlist(
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

async function handleSubmitSuccess({
  mode,
  router,
  queryClient,
}: {
  mode: "create" | "edit";
  router: ReturnType<typeof useRouter>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  toaster.create({
    type: "success",
    title: mode === "create" ? "Watchlist created successfully" : "Changes saved successfully",
  });

  await router.invalidate?.();
  invalidateWatchlistQueries(queryClient);
}

function handleSubmitError(error: unknown) {
  console.error("Failed to save watchlist", error);

  toaster.create({
    type: "error",
    title: error instanceof Error ? error.message : "Failed to save watchlist. Please try again.",
  });
}

function getDefaultValues(watchlist: Watchlist | undefined): WatchlistFormValues {
  if (!watchlist) {
    return { name: "", description: "", itemOrderMode: "release" };
  }

  return {
    name: watchlist.name,
    description: watchlist.description ?? "",
    itemOrderMode: watchlist.itemOrderMode,
  };
}
