-- Private operational accounts, separate from the public product catalogue.
CREATE TABLE accounting_settings (id TEXT PRIMARY KEY CHECK(id='main'),data TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE accounting_entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 kind TEXT NOT NULL CHECK(kind IN ('purchase','sale','refund','expense')),
 state TEXT NOT NULL CHECK(state IN ('draft','posted','void')),
 data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 created_by INTEGER NOT NULL
);
CREATE TABLE accounting_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,entry_id INTEGER,
 action TEXT NOT NULL,before_data TEXT,after_data TEXT,
 actor_id INTEGER NOT NULL,created_at INTEGER NOT NULL
);
CREATE TABLE accounting_documents (
 id TEXT PRIMARY KEY,entry_id INTEGER NOT NULL REFERENCES accounting_entries(id),
 storage_key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,mime TEXT NOT NULL,
 bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX accounting_document_entry ON accounting_documents(entry_id);
CREATE INDEX accounting_entry_state ON accounting_entries(state,id);
-- A single item cannot be posted as sold twice before a recorded return.
CREATE TABLE accounting_stock_claims (item_key TEXT PRIMARY KEY,sale_id INTEGER NOT NULL UNIQUE REFERENCES accounting_entries(id));
CREATE TRIGGER accounting_entry_immutable BEFORE UPDATE ON accounting_entries
WHEN OLD.state IN ('posted','void') AND ((NEW.data!=OLD.data AND NOT (NEW.state='posted' AND OLD.state='posted' AND json_remove(NEW.data,'$.paidFrom','$.paymentReference','$.reconciled')=json_remove(OLD.data,'$.paidFrom','$.paymentReference','$.reconciled'))) OR NEW.kind!=OLD.kind OR NEW.state='draft') BEGIN
 SELECT RAISE(ABORT,'posted_entry_immutable');
END;
CREATE TRIGGER accounting_no_delete BEFORE DELETE ON accounting_entries BEGIN SELECT RAISE(ABORT,'accounting_history_retained'); END;
CREATE TRIGGER accounting_events_no_update BEFORE UPDATE ON accounting_events BEGIN SELECT RAISE(ABORT,'accounting_history_retained'); END;
CREATE TRIGGER accounting_events_no_delete BEFORE DELETE ON accounting_events BEGIN SELECT RAISE(ABORT,'accounting_history_retained'); END;
CREATE TRIGGER accounting_refund_limit BEFORE UPDATE OF state ON accounting_entries
WHEN NEW.state='posted' AND OLD.state='draft' AND NEW.kind='refund' BEGIN
 SELECT CASE WHEN COALESCE((SELECT SUM(json_extract(data,'$.amountCents')) FROM accounting_entries WHERE kind='refund' AND state='posted' AND json_extract(data,'$.saleId')=json_extract(NEW.data,'$.saleId')),0)+json_extract(NEW.data,'$.amountCents') > COALESCE((SELECT json_extract(data,'$.amountCents')+json_extract(data,'$.shippingChargedCents') FROM accounting_entries WHERE id=json_extract(NEW.data,'$.saleId') AND kind='sale' AND state='posted'),-1)
 THEN RAISE(ABORT,'refund_exceeds_sale') END;
END;

CREATE UNIQUE INDEX accounting_purchase_reference ON accounting_entries(lower(json_extract(data,'$.channel')),json_extract(data,'$.reference')) WHERE kind='purchase' AND state='posted' AND json_extract(data,'$.reference')!='';
CREATE TRIGGER accounting_sale_purchase BEFORE UPDATE OF state ON accounting_entries
WHEN NEW.state='posted' AND OLD.state='draft' AND NEW.kind='sale' BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM accounting_entries p WHERE p.kind='purchase' AND p.state='posted'
  AND p.id=CAST(substr(json_extract(NEW.data,'$.itemKey'),1,instr(json_extract(NEW.data,'$.itemKey'),':')-1) AS INTEGER)
  AND json_extract(p.data,'$.date')<=json_extract(NEW.data,'$.date')
  AND json_array_length(json_extract(p.data,'$.lines'))>CAST(substr(json_extract(NEW.data,'$.itemKey'),instr(json_extract(NEW.data,'$.itemKey'),':')+1) AS INTEGER)
 ) THEN RAISE(ABORT,'purchase_not_available') END;
END;
CREATE TRIGGER accounting_void_dependencies BEFORE UPDATE OF state ON accounting_entries
WHEN NEW.state='void' AND OLD.state='posted' BEGIN
 SELECT CASE WHEN (OLD.kind='purchase' AND EXISTS(SELECT 1 FROM accounting_entries s WHERE s.kind='sale' AND s.state='posted' AND CAST(substr(json_extract(s.data,'$.itemKey'),1,instr(json_extract(s.data,'$.itemKey'),':')-1) AS INTEGER)=OLD.id))
 OR (OLD.kind='sale' AND EXISTS(SELECT 1 FROM accounting_entries r WHERE r.kind='refund' AND r.state='posted' AND json_extract(r.data,'$.saleId')=OLD.id))
 THEN RAISE(ABORT,'dependent_posted_entries') END;
END;
