import type { PublicItem } from "@/server/services/items";

import { DeleteItemButton } from "./delete-item-button";
import { EditItemModal } from "./edit-item-modal";
import { RemoveFromListButton } from "./remove-from-list-button";

/**
 * Two rows, every button full width within its cell (T090):
 *
 * - Item in one list  → `Editar` (full width), then `Eliminar` (full width).
 *   No `Quitar`: removing the item's only list membership *is* deleting it
 *   (`docs/frontend/CLAUDE.md` § "Delete vs. remove"), so the two buttons
 *   would do the same thing.
 * - Item in several lists → `Editar` + `Quitar` share the top row 50/50,
 *   `Eliminar` spans the row below.
 *
 * `isLastList` (from `ItemGrid`, which already counts memberships for
 * `RemoveFromListButton`) is the single-vs-several signal.
 */
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
    <div className="grid grid-cols-2 gap-2 [&_button]:w-full">
      <div className={isLastList ? "col-span-2" : undefined}>
        <EditItemModal item={item} />
      </div>
      {!isLastList && (
        <div>
          <RemoveFromListButton item={item} wishlistId={wishlistId} isLastList={isLastList} />
        </div>
      )}
      <div className="col-span-2">
        <DeleteItemButton item={item} />
      </div>
    </div>
  );
}
