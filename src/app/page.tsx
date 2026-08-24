import { redirect } from "next/navigation";

import { currentUserId } from "@/server/auth/session";
import { getMyWishlists } from "@/server/services/me";

/**
 * Logged in → your default wishlist (`getMyWishlists` already sorts it
 * first). Anonymous → `/login`. Every registered user has exactly one
 * default list, enforced at registration (T011/T021), so there's no empty
 * case to handle here.
 */
export default async function Home() {
  const userId = await currentUserId();
  if (!userId) redirect("/login");

  const wishlists = await getMyWishlists(userId);
  redirect(`/w/${wishlists[0].slug}`);
}
