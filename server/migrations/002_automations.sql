-- Automations: overdue reminders, data privacy consent, balance inquiries

-- Admin-editable automation settings (JSON per key)
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by INT REFERENCES admins(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Due date parsed from the sheet (ISO date) so reminders can be computed
ALTER TABLE contacts ADD COLUMN due_date DATE;

-- Runs can now also be started by the daily reminder automation
ALTER TABLE runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'broadcast' CHECK (kind IN ('broadcast', 'reminders'));
ALTER TABLE runs DROP CONSTRAINT runs_trigger_check;
ALTER TABLE runs ADD CONSTRAINT runs_trigger_check CHECK (trigger IN ('manual', 'schedule', 'automation'));

ALTER TABLE run_recipients ADD COLUMN contact_key TEXT;
ALTER TABLE run_recipients ADD COLUMN due_date DATE;
ALTER TABLE run_recipients ADD COLUMN reminder_days INT;

-- One row per (contact, due date, reminder stage) once a reminder was delivered,
-- so each stage (e.g. due date +5, +14, +30) goes out at most once per bill.
CREATE TABLE reminder_sends (
  id          BIGSERIAL PRIMARY KEY,
  contact_key TEXT NOT NULL,
  due_date    DATE NOT NULL,
  rule_days   INT NOT NULL,
  run_id      INT REFERENCES runs(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_key, due_date, rule_days)
);

-- Data privacy notice sent to people who message us but are not in the contact list
CREATE TABLE consents (
  id             BIGSERIAL PRIMARY KEY,
  channel        TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  address        TEXT NOT NULL,
  profile_name   TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  notice_sent_at TIMESTAMPTZ,
  responded_at   TIMESTAMPTZ,
  response_text  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, address)
);

-- Automatic replies (privacy notice, balance) are marked so the inbox can show them
ALTER TABLE messages ADD COLUMN auto BOOLEAN NOT NULL DEFAULT FALSE;
