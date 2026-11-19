-- 055: an optional "pieces per pack" hint on a product, so restocking
-- something bought in fixed-count packs -- cigarettes, for instance, where
-- the same per-stick price can come in packets of 10 or 20 -- can be
-- entered on the Stock in screen as "X packets of Y" instead of a raw
-- piece count worked out by hand.
--
-- Purely a convenience default: it's per PRODUCT (the owner-level catalog,
-- same place "unit" lives), not fixed forever -- a restock can still type a
-- different pack size on the day (a distributor sometimes sends 10s
-- instead of the usual 20s), and the actual piece count added to stock is
-- unchanged -- adjust_stock (003) still just takes a plain quantity. Two
-- products at different prices (Gold Flake Kings vs Small Gold Flake, say)
-- are, as before, just two separate catalog items, each with its own
-- pack_size.

alter table products add column if not exists pack_size integer check (pack_size is null or pack_size > 0);

select record_migration('055', '055_product_pack_size.sql');
