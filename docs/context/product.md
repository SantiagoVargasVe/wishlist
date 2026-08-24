# Product Context

## The problem

Sharing a wishlist today means pasting raw links into WhatsApp. They render as ugly text, nobody
can tell what's already been bought, and two people end up buying the same gift.

## The shape of the solution

One link per list. It renders as a proper card when shared. Anyone holding the link can mark an
item bought — no account needed — and by default the list owner can't see those marks, so the
surprise survives.

## Users

| Who | Auth | Can do |
|---|---|---|
| **Owner** | Logged in, viewing their own list | Everything: add, edit, delete items and lists, share |
| **Visitor** | Anyone with the link | View the list, mark/unmark items as bought |

A logged-in user looking at *someone else's* list is just a visitor. There is no privilege tier
beyond "owns this list or doesn't" — see [ADR-0005](../adr/0005-no-role-column.md).

## Core flows

**Adding an item.** Owner clicks *Add item* → pastes a product URL → the server fetches the page
and extracts OG metadata → title, image, and price prefill the form → owner corrects anything
wrong, picks which lists it belongs to, saves.

The scrape is a convenience, never a gate. Title and image land ~90% of the time; price closer to
50%. A failed scrape still gives you a working form.

**Sharing.** Owner hits the share CTA on their default list and gets `{APP_URL}/w/{slug}`.
The slug is an unguessable nanoid — possession of the link *is* the permission.

**Marking bought.** Visitor opens the link, clicks *Mark as bought* on an item. It's reserved for
everyone else who opens the link. A token in their localStorage lets them undo it later.

## Decisions already made

- Items belong to **multiple lists** and are scoped to their owner. Two people saving the same
  Amazon link get two independent items — bought state must never leak across users.
- Claims live on the **item**, not the item-in-a-list. One physical gift, bought once, shows as
  bought everywhere it appears.
- Every user gets a default list called **Wishlist** on registration. It can be renamed but not
  deleted — the share CTA depends on it existing.
- Prices are stored in **COP or USD** with a normalized USD snapshot so filtering across mixed
  currencies works. Display always uses the original currency.
- Registration requires an **invite code**. The site is on a public URL and this is a family tool.
- UI is **Spanish-first**. The primary users are family members.

## Out of scope for v1

Quantity per item · item priority/ranking · comments or notes from visitors · price-drop tracking ·
email notifications · copying another user's item into your own list · public list discovery ·
mobile apps

Email is *technically* available — the home server has working Gmail SMTP — but password reset is
deliberately deferred.

## What "done" looks like for v1

Santiago adds ten items from Colombian retailers, shares the link in the family WhatsApp group, it
renders as a card, and three relatives mark things bought without creating accounts or spoiling
anything.
