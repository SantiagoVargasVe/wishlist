/**
 * Query key factory. Every `useQuery`/`useMutation` invalidation goes through
 * this — an inline key array (`["wishlist", slug]` typed out by hand at each
 * call site) is how cache invalidation silently stops working after a typo.
 */
export const queryKeys = {
  me: () => ["me"] as const,
  wishlist: (slug: string) => ["wishlist", slug] as const,
  preview: (url: string) => ["preview", url] as const,
};
