-- Telegram as a messaging channel (alongside / instead of WhatsApp)

ALTER TABLE run_recipients DROP CONSTRAINT run_recipients_channel_check;
ALTER TABLE run_recipients ADD CONSTRAINT run_recipients_channel_check CHECK (channel IN ('whatsapp', 'telegram', 'email', 'none'));
ALTER TABLE messages DROP CONSTRAINT messages_channel_check;
ALTER TABLE messages ADD CONSTRAINT messages_channel_check CHECK (channel IN ('whatsapp', 'telegram', 'email'));
ALTER TABLE consents DROP CONSTRAINT consents_channel_check;
ALTER TABLE consents ADD CONSTRAINT consents_channel_check CHECK (channel IN ('whatsapp', 'telegram', 'email'));

-- A Telegram bot can only message people who started it, and only by chat id.
-- Residents link their chat by sharing their own phone number with the bot.
CREATE TABLE telegram_links (
  chat_id     BIGINT PRIMARY KEY,
  phone       TEXT NOT NULL,            -- digits, international format (matches contacts.whatsapp)
  user_id     BIGINT NOT NULL,
  username    TEXT,
  first_name  TEXT,
  linked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_at  TIMESTAMPTZ               -- set when the user blocks the bot
);
CREATE INDEX telegram_links_phone_idx ON telegram_links (phone);
