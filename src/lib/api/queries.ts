import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CreateItemInput, UpdateItemInput } from "@/lib/schemas/item";
import type { CreateWishlistInput, UpdateWishlistInput } from "@/lib/schemas/wishlist";
import type { PreviewResult } from "@/server/og/preview";
import type { PublicItem } from "@/server/services/items";
import type { PublicVisitorWishlist } from "@/server/services/public-wishlist";
import type { PublicWishlist } from "@/server/services/wishlists";

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

/**
 * `url` is `null` until the caller has a debounced, schema-valid URL to
 * scrape — `enabled` gates the request rather than the caller skipping the
 * hook entirely, so the loading/error states stay available to render a
 * skeleton immediately once a valid URL lands. A `POST` under the hood, but
 * modeled as a query: it's a cacheable read (same URL twice reuses the
 * result) with no side effect of its own, and `useQuery` gives dedup + an
 * `isFetching` flag for free.
 */
export function usePreviewQuery(url: string | null) {
  return useQuery({
    queryKey: queryKeys.preview(url ?? ""),
    queryFn: () =>
      apiFetch<PreviewResult>("/api/preview", { method: "POST", body: JSON.stringify({ url }) }),
    enabled: url !== null,
    staleTime: Infinity,
    retry: false,
  });
}

export function useCreateItemMutation() {
  return useMutation({
    mutationFn: (input: CreateItemInput) =>
      apiFetch<{ item: PublicItem }>("/api/items", { method: "POST", body: JSON.stringify(input) }),
  });
}

export function useUpdateItemMutation() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateItemInput }) =>
      apiFetch<{ item: PublicItem }>(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
  });
}

export function useDeleteItemMutation() {
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/items/${id}`, { method: "DELETE" }),
  });
}

export function useRemoveItemFromWishlistMutation() {
  return useMutation({
    mutationFn: ({ itemId, wishlistId }: { itemId: string; wishlistId: string }) =>
      apiFetch<void>(`/api/items/${itemId}/wishlists/${wishlistId}`, { method: "DELETE" }),
  });
}

export function useCreateWishlistMutation() {
  return useMutation({
    mutationFn: (input: CreateWishlistInput) =>
      apiFetch<{ wishlist: PublicWishlist }>("/api/wishlists", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function useUpdateWishlistMutation() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWishlistInput }) =>
      apiFetch<{ wishlist: PublicWishlist }>(`/api/wishlists/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
  });
}

/** `deleteOrphans` becomes `?deleteOrphans=true` — see WishlistErrors.confirmDeleteOrphans. */
export function useDeleteWishlistMutation() {
  return useMutation({
    mutationFn: ({ id, deleteOrphans }: { id: string; deleteOrphans: boolean }) =>
      apiFetch<void>(`/api/wishlists/${id}${deleteOrphans ? "?deleteOrphans=true" : ""}`, {
        method: "DELETE",
      }),
  });
}

/** `expiresAt` is a string here — a `Date` on the server, ISO-serialized over the wire. */
export function useMintInviteMutation() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ code: string; expiresAt: string }>("/api/invites", { method: "POST" }),
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
