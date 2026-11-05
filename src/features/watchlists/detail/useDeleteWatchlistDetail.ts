import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import { deleteWatchlist } from "@/features/watchlists/delete/Mutation";

export function useDeleteWatchlistDetail(watchlistId: number) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteWatchlistFn = useServerFn(deleteWatchlist);
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteWatchlistFn({ data: { id: watchlistId } });
      if (!result.success) throw new Error(result.message);
    } catch (error) {
      console.error("Failed to delete watchlist", error);
      toaster.create({ type: "error", title: "Failed to delete watchlist. Please try again." });
      return;
    } finally {
      setDeleting(false);
    }
    setDeleteOpen(false);
    toaster.create({ type: "success", title: "Watchlist deleted" });
    await queryClient.invalidateQueries({ queryKey: ["watchlists"], refetchType: "none" });
    await navigate({ to: "/", replace: true });
    await router.invalidate();
  };

  return { deleteOpen, setDeleteOpen, deleting, handleDelete };
}
