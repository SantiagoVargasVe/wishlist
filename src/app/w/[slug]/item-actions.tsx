import type { PublicItem } from "@/server/services/items";

import { DeleteItemButton } from "./delete-item-button";
import { EditItemModal } from "./edit-item-modal";
import { RemoveFromListButton } from "./remove-from-list-button";

export function ItemActions({
  item,
  wishlistId,
  isLastList,
}: {
  item: PublicItem;
  wishlistId: string;
  isLastList: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <EditItemModal item={item} />
      <RemoveFromListButton item={item} wishlistId={wishlistId} isLastList={isLastList} />
      <DeleteItemButton item={item} />
    </div>
  );
}
