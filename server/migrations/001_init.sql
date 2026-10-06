-- Notify: initial schema
-- PostgreSQL 14+

CREATE TABLE admins (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Where contacts come from. Exactly one source is active at a time.
CREATE TABLE data_sources (
  id              SERIAL PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('upload', 'google_sheet')),
  label           TEXT NOT NULL,              -- file name or sheet URL
  sheet_id        TEXT,
  sheet_gid       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  row_count       INT NOT NULL DEFAULT 0,
  columns         JSONB NOT NULL DEFAULT '[]',
  last_synced_at  TIMESTAMPTZ,
  last_sync_error TEXT,
  created_by      INT REFERENCES admins(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX data_sources_one_active ON data_sources (is_active) WHERE is_active;

-- Snapshot of the rows of a data source. Replaced on every sync.
CREATE TABLE contacts (
  id          BIGSERIAL PRIMARY KEY,
  source_id   INT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  row_number  INT NOT NULL,
  name        TEXT,
  whatsapp    TEXT,            -- digits only, international format (no +)
  email       TEXT,            -- lower-cased
  status      TEXT,            -- lower-cased status key
  amount      NUMERIC,
  fields      JSONB NOT NULL DEFAULT '{}',  -- every column, keyed by normalized header
  warnings    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contacts_source_idx ON contacts (source_id);
CREATE INDEX contacts_whatsapp_idx ON contacts (whatsapp);
CREATE INDEX contacts_email_idx ON contacts (email);

-- One template per status type. status_key '*' is the optional fallback.
CREATE TABLE templates (
  id               SERIAL PRIMARY KEY,
  status_key       TEXT NOT NULL UNIQUE,
  label            TEXT NOT NULL DEFAULT '',
  wa_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  wa_body          TEXT NOT NULL DEFAULT '',
  wa_template_name TEXT,                       -- Meta-approved template name (required for business-initiated messages)
  wa_language      TEXT NOT NULL DEFAULT 'en',
  wa_params        JSONB NOT NULL DEFAULT '["name","amount"]', -- variables mapped to {{1}}, {{2}}, ...
  email_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  email_subject    TEXT NOT NULL DEFAULT '',
  email_body       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE schedules (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  next_run_at  TIMESTAMPTZ,
  cron         TEXT,                          -- NULL = one-time
  timezone     TEXT NOT NULL DEFAULT 'UTC',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  last_run_id  INT,
  created_by   INT REFERENCES admins(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_by INT REFERENCES admins(id),
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX schedules_due_idx ON schedules (next_run_at) WHERE status = 'active';

CREATE TABLE runs (
  id               SERIAL PRIMARY KEY,
  trigger          TEXT NOT NULL CHECK (trigger IN ('manual', 'schedule')),
  schedule_id      INT REFERENCES schedules(id),
  source_id        INT REFERENCES data_sources(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'running', 'completed', 'completed_with_failures', 'failed', 'cancelled')),
  requested_by     INT REFERENCES admins(id),
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  total            INT NOT NULL DEFAULT 0,
  sent             INT NOT NULL DEFAULT 0,
  failed           INT NOT NULL DEFAULT 0,
  skipped          INT NOT NULL DEFAULT 0,
  error            TEXT,
  failure_report   JSONB,
  admin_notified_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at       TIMESTAMPTZ,
  heartbeat_at     TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ
);
CREATE INDEX runs_status_idx ON runs (status);
ALTER TABLE schedules ADD CONSTRAINT schedules_last_run_fk FOREIGN KEY (last_run_id) REFERENCES runs(id);

-- Work queue for a run: one row per (contact, channel). The immutable record is audit_log.
CREATE TABLE run_recipients (
  id                  BIGSERIAL PRIMARY KEY,
  run_id              INT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  contact_id          BIGINT,
  row_number          INT,
  contact_name        TEXT,
  channel             TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'none')),
  address             TEXT,
  status_key          TEXT,
  template_id         INT REFERENCES templates(id) ON DELETE SET NULL,
  rendered_subject    TEXT,
  rendered_body       TEXT,
  wa_payload          JSONB,
  state               TEXT NOT NULL DEFAULT 'pending'
                      CHECK (state IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts            INT NOT NULL DEFAULT 0,
  last_error          TEXT,
  provider_message_id TEXT,
  sent_at             TIMESTAMPTZ,
  UNIQUE (run_id, contact_id, channel)
);
CREATE INDEX run_recipients_run_idx ON run_recipients (run_id, channel, state);
CREATE INDEX run_recipients_msgid_idx ON run_recipients (provider_message_id);

-- Inbox: replies received from contacts, and the admin's answers to them.
CREATE TABLE messages (
  id                  BIGSERIAL PRIMARY KEY,
  channel             TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  direction           TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  address             TEXT NOT NULL,          -- the contact's phone digits or email
  contact_name        TEXT,
  subject             TEXT,
  body                TEXT NOT NULL DEFAULT '',
  provider_message_id TEXT,                   -- wamid / email Message-ID
  in_reply_to         TEXT,
  run_recipient_id    BIGINT REFERENCES run_recipients(id) ON DELETE SET NULL,
  is_read             BOOLEAN NOT NULL DEFAULT FALSE,
  sent_by             INT REFERENCES admins(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messages_provider_uniq ON messages (channel, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX messages_thread_idx ON messages (channel, address, created_at);

CREATE TABLE imap_state (
  mailbox     TEXT PRIMARY KEY,
  uidvalidity BIGINT NOT NULL,
  last_uid    BIGINT NOT NULL
);

-- Immutable, hash-chained audit log. Every send attempt (success or failure),
-- delivery status, inbound reply, admin reply and admin action lands here.
CREATE TABLE audit_log (
  id                  BIGSERIAL PRIMARY KEY,
  ts                  TIMESTAMPTZ NOT NULL,
  event               TEXT NOT NULL,
  actor               TEXT NOT NULL,          -- 'system', 'admin:<email>', 'webhook:whatsapp', ...
  run_id              INT,
  channel             TEXT,
  direction           TEXT,
  contact_name        TEXT,
  address             TEXT,
  status              TEXT,
  provider_message_id TEXT,
  error               TEXT,
  details             JSONB NOT NULL DEFAULT '{}',
  prev_hash           TEXT,
  hash                TEXT NOT NULL UNIQUE
);
CREATE INDEX audit_log_ts_idx ON audit_log (ts DESC);
CREATE INDEX audit_log_run_idx ON audit_log (run_id);
CREATE INDEX audit_log_event_idx ON audit_log (event);
CREATE INDEX audit_log_address_idx ON audit_log (address);

CREATE FUNCTION audit_log_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_mutation();
