CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"image_path" text,
	"source_image_url" text,
	"site_name" text,
	"price_amount" numeric(14, 2),
	"price_currency" char(3),
	"price_usd_snapshot" numeric(14, 2),
	"fx_rate_used" numeric(14, 6),
	"og_status" text DEFAULT 'pending' NOT NULL,
	"og_fetched_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_og_status_valid" CHECK ("items"."og_status" IN ('pending', 'ok', 'failed', 'manual')),
	CONSTRAINT "items_currency_supported" CHECK ("items"."price_currency" IS NULL OR "items"."price_currency" IN ('COP', 'USD')),
	CONSTRAINT "items_price_currency_paired" CHECK (("items"."price_amount" IS NULL) = ("items"."price_currency" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"wishlist_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_items_wishlist_id_item_id_pk" PRIMARY KEY("wishlist_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"hide_claims_from_owner" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlists_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_owner_live_idx" ON "items" USING btree ("owner_id") WHERE "items"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "wishlist_items_item_idx" ON "wishlist_items" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_one_default_per_owner" ON "wishlists" USING btree ("owner_id") WHERE "wishlists"."is_default";--> statement-breakpoint
CREATE INDEX "wishlists_owner_idx" ON "wishlists" USING btree ("owner_id");