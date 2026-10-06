# Notify — WhatsApp & email notification automation

A web dashboard that reads a contact list (CSV / Excel upload or a Google Sheets link), picks a message template by each contact's **status**, fills in their **name** and **amount**, and sends it **first by WhatsApp, then by email**, now or on a schedule. Every attempt, including failures, goes into an append-only, hash-chained **audit log**. Replies come into a **Replies inbox**, and you can answer them from there.

| | |
|---|---|
| Backend | Node.js 20+ (Express 5), separate worker process |
| Database | PostgreSQL 14+ |
| Frontend | React 19 + Vite (served by the backend in production) |
| Chat | **Telegram** bot and/or Meta WhatsApp Business **Cloud API**. Each person gets Telegram if they joined the bot, otherwise WhatsApp, plus email |
| Email | Any SMTP server for sending; IMAP for reading replies |
| Hosting | Mac mini (macOS) + PM2, published through a **Cloudflare Tunnel** |

**Start here**
- [docs/TELEGRAM-SETUP.md](docs/TELEGRAM-SETUP.md): the **Telegram** channel (`TELEGRAM_ENABLED`, `WHATSAPP_ENABLED`) and how residents join the bot
- [docs/TEMPLATES-MANHATTAN-RESIDENCE.md](docs/TEMPLATES-MANHATTAN-RESIDENCE.md): the Manhattan Residence messages (bill notice, reminders, privacy notice, balance replies) and the WhatsApp templates to submit to Meta. Load them with `npm run seed -- seeds/manhattan-residence.json`.
- [docs/WHAT-I-NEED.md](docs/WHAT-I-NEED.md): accounts and credentials to set up (WhatsApp number, email, and so on)
- [docs/DEPLOY-MACOS.md](docs/DEPLOY-MACOS.md): install on the Mac mini and publish it with Cloudflare
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): diagrams, data model, API reference, security, scaling

## What it does

1. **Source**: upload `.csv`, `.xls` or `.xlsx`, or paste a Google Sheets link. The newest source becomes the active list. A Google Sheet is re-read right before every send, so edits made in the sheet are always picked up.
2. **Templates**: one template per status type (e.g. `overdue`, `reminder`), each with WhatsApp and email versions. Variables: `{{name}}`, `{{first_name}}`, `{{amount}}`, `{{amount_formatted}}` and **any other column** (e.g. `{{due_date}}`). A `*` template catches statuses that have no template of their own.
3. **Send now**, or **schedule** a send (one time, daily, weekly, monthly or a cron rule). Schedules can be **cancelled**, and a run in progress can be **stopped**.
4. **Order**: the whole WhatsApp list is sent first, then the whole email list. A contact with both gets both.
5. **Failures**: transient errors are retried up to 3 times. Each attempt is logged. Rows that can't be sent are recorded as failed with the reason: invalid number, no template for the status, a missing amount, provider rejection. **After the whole list has been processed**, one consolidated failure report is emailed to the admin and shown on the run page (also downloadable as CSV).
6. **Audit log**: append-only. The database blocks UPDATE, DELETE and TRUNCATE, and each entry carries a SHA-256 hash of the previous one. **Verify integrity** re-checks the whole chain. Logins, template edits, schedule changes, sends, delivery receipts, replies and admin replies are all recorded. Export to CSV.
7. **Automations** (Automations page):
   - **Overdue reminders**: a daily check re-reads the sheet. Accounts still marked unpaid get a reminder at configurable stages after the due date (default +5, +14, +30 days), each stage once per bill.
   - **Data Privacy Notice**: sent automatically to people not in the list who message on WhatsApp. Their YES/NO is recorded on the **Privacy consents** page.
   - **Balance inquiries**: residents who ask about their balance get an automatic reply with their latest figures and days overdue.
8. **Replies**: inbound WhatsApp messages (via webhook) and email replies (via IMAP) are stored. Only replies from contacts are kept. You answer from the dashboard.

## Run it locally (5 minutes, no credentials needed)

The default `mock` providers don't send anything real. As a test hook, WhatsApp numbers ending in `0000` and email addresses containing `fail` are made to fail.

```bash
# 1. PostgreSQL (macOS: brew install postgresql@16 && brew services start postgresql@16)
createuser notify --pwprompt          # use "notify" for local dev
createdb notify --owner notify

# 2. Backend
cd server
npm install
cp .env.example .env                  # then edit: NODE_ENV=development, SESSION_SECRET (32+ chars),
                                      # ADMIN_EMAIL/ADMIN_PASSWORD, DATABASE_URL, PUBLIC_URL=http://localhost:5173, LOG_FILE=
npm run dev                           # API on :4000 (runs migrations, creates the admin)
npm run dev:worker                    # in a second terminal: scheduler + sender + IMAP reader

# 3. Frontend (third terminal)
cd web && npm install && npm run dev  # http://localhost:5173
```

Sign in, upload `docs/sample-contacts.csv`, add templates for `overdue` and `reminder`, and click **Send now**.

> **Excel files**: `.xls`/`.xlsx` parsing uses SheetJS, which is installed from `cdn.sheetjs.com` (the patched version; the copy on npm is outdated and has known vulnerabilities). It's an optional dependency, so if the download is blocked everything else still installs and CSV keeps working.

## Tests

```bash
cd server
createdb notify_test --owner notify
npm test     # unit tests + end-to-end tests against a real Postgres
```

The tests cover WhatsApp-before-email ordering, the single consolidated failure report, a missing template, a missing amount, no channel, retries, audit immutability, tamper detection, webhook signature checks, reply deduplication, the inbox reply flow, schedules (create, fire, cancel), stopping a run, and crash recovery that doesn't re-send messages.

## Project layout

```
server/
  migrations/001_init.sql      schema (append-only audit log with triggers)
  src/index.js                 API server          src/worker.js   scheduler + sender + IMAP
  src/services/runner.js       the send engine     src/services/audit.js  hash-chained log
  src/services/{sources,spreadsheet,googleSheets,schedules,inbound,imap}.js
  src/providers/{whatsapp,email}.js
  src/routes/*.js              REST API
  test/                        node:test suites
web/src/pages/*.jsx            dashboard pages
deploy/                        cloudflared config, backup script, log rotation, DB roles
ecosystem.config.cjs           PM2 processes
```
