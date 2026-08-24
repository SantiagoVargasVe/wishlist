import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PublicVisitorWishlist } from "@/server/services/public-wishlist";

import { apiFetch } from "./client";
import { queryKeys } from "./keys";

type WishlistResponse = { wishlist: PublicVisitorWishlist };

/** `initialData` is T052's SSR props — no extra round trip on first paint. */
export function useWishlistQuery(slug: string, initialData: PublicVisitorWishlist) {
  return useQuery({
    queryKey: queryKeys.wishlist(slug),
    queryFn: () => apiFetch<WishlistResponse>(`/api/w/${slug}`).then((r) => r.wishlist),
    initialData,
  });
}

function withItemClaimed(
  wishlist: PublicVisitorWishlist,
  itemId: string,
  claimed: boolean,
): PublicVisitorWishlist {
  return {
    ...wishlist,
    items: wishlist.items.map((item) => (item.id === itemId ? { ...item, claimed } : item)),
  };
}

/**
 * `onMutate` flips the cache, `onError` rolls back, `onSettled` invalidates —
 * design-system.md's exact prescription. A 409 race (someone else claimed it
 * a moment earlier) rolls back to the pre-optimistic state and then the
 * invalidated refetch corrects it to the true "claimed by someone" — briefly
 * wrong, never stuck wrong.
 */
export function useClaimMutation(slug: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.wishlist(slug);

  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<{ claimToken: string }>(`/api/w/${slug}/items/${itemId}/claim`, {
        method: "POST",
      }),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PublicVisitorWishlist>(key);
      if (previous) queryClient.setQueryData(key, withItemClaimed(previous, itemId, true));
      return { previous };
    },
    onError: (_error, _itemId, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUnclaimMutation(slug: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.wishlist(slug);

  return useMutation({
    mutationFn: ({ itemId, claimToken }: { itemId: string; claimToken: string }) =>
      apiFetch<void>(`/api/w/${slug}/items/${itemId}/claim`, {
        method: "DELETE",
        body: JSON.stringify({ claimToken }),
      }),
    onMutate: async ({ itemId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PublicVisitorWishlist>(key);
      if (previous) queryClient.setQueryData(key, withItemClaimed(previous, itemId, false));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
