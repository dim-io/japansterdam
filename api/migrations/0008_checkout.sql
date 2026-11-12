CREATE TABLE commerce_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE orders (
 id TEXT PRIMARY KEY, access_hash TEXT NOT NULL, request_hash TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('test','live')), status TEXT NOT NULL,
 customer TEXT NOT NULL, items TEXT NOT NULL, policy TEXT NOT NULL,
 subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL, total INTEGER NOT NULL,
 payment_request TEXT NOT NULL, payment_id TEXT UNIQUE, checkout_url TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, paid_at INTEGER,
 fulfillment TEXT NOT NULL DEFAULT 'unfulfilled', tracking TEXT NOT NULL DEFAULT '',
 refunded INTEGER NOT NULL DEFAULT 0, chargeback INTEGER NOT NULL DEFAULT 0,
 setup_error TEXT, last_sync_at INTEGER
);
CREATE INDEX orders_status ON orders(status,updated_at);
CREATE TABLE stock_reservations (slug TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), expected_cents INTEGER NOT NULL);
CREATE INDEX stock_reservation_order ON stock_reservations(order_id);
CREATE TRIGGER stock_available BEFORE INSERT ON stock_reservations BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM products WHERE slug=NEW.slug AND COALESCE(json_extract(data,'$.active'),1)=1 AND COALESCE(json_extract(data,'$.sold'),0)=0 AND ROUND(json_extract(data,'$.price')*100)=NEW.expected_cents)
 THEN RAISE(ABORT,'piece_unavailable') END;
END;
CREATE TABLE commerce_rate_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL);
CREATE TABLE order_messages (
 order_id TEXT NOT NULL REFERENCES orders(id), kind TEXT NOT NULL, payload TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, last_attempt_at INTEGER, sent_at INTEGER,
 PRIMARY KEY(order_id,kind)
);
CREATE TABLE withdrawals (order_id TEXT PRIMARY KEY REFERENCES orders(id), requested_at INTEGER NOT NULL, note TEXT NOT NULL);

CREATE TRIGGER reserved_product_update BEFORE UPDATE OF data ON products
WHEN EXISTS (SELECT 1 FROM stock_reservations r JOIN orders o ON o.id=r.order_id WHERE r.slug=OLD.slug AND (o.status!='paid' OR COALESCE(json_extract(NEW.data,'$.sold'),0)!=1)) BEGIN
 SELECT RAISE(ABORT,'piece_reserved_by_order');
END;
CREATE TRIGGER reserved_product_delete BEFORE DELETE ON products
WHEN EXISTS (SELECT 1 FROM stock_reservations WHERE slug=OLD.slug) BEGIN
 SELECT RAISE(ABORT,'piece_reserved_by_order');
END;
