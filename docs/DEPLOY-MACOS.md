# Deploying on a Mac mini (M4 Pro) with Cloudflare

The app listens only on `127.0.0.1:4000`. A **Cloudflare Tunnel** (`cloudflared`) makes an outbound connection to Cloudflare, so there's **no port forwarding, no public IP and no certificates** to manage on the Mac. Cloudflare terminates HTTPS.

```
Browser / Meta webhooks ──HTTPS──▶ Cloudflare edge (TLS, WAF, rate limits)
                                        │  outbound tunnel (QUIC)
                                        ▼
Mac mini: cloudflared ──▶ 127.0.0.1:4000 notify-api (PM2) ──▶ PostgreSQL 16 (localhost)
                                          notify-worker (PM2 ×1) ──▶ WhatsApp Cloud API / SMTP / IMAP / Google
```

## 1. Prepare macOS

- System Settings → Energy: **Prevent automatic sleeping**, **Start up automatically after a power failure**, and enable *Wake for network access*.
- System Settings → General → Sharing: turn on **Remote Login** (SSH) if you want to manage it remotely.
- Create a standard (non-admin) user such as `notify` to run the service. Optional, but recommended.
- FileVault on. Firewall on (System Settings → Network → Firewall). No inbound ports are needed.

## 2. Install the tools

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node@22 postgresql@16 cloudflared git
brew link --force node@22
brew services start postgresql@16
npm install -g pm2
```

## 3. Database

```bash
createuser notify --pwprompt              # choose a strong password
createdb notify --owner notify
# Postgres listens on localhost only by default (Homebrew). Keep it that way.
```

Optional hardening: run the app as a role that can't modify the audit log at all. See `deploy/db-roles.sql`.

## 4. Get the code and configure

```bash
sudo mkdir -p /usr/local/var/log/notify && sudo chown "$USER" /usr/local/var/log/notify
git clone https://github.com/drnt2584/manhattanproject.git ~/notify
cd ~/notify/server && npm install          # also fetches SheetJS (Excel support) from cdn.sheetjs.com
cp .env.example .env && chmod 600 .env
openssl rand -hex 32                      # paste the result as SESSION_SECRET
nano .env                                 # fill in everything from docs/WHAT-I-NEED.md
cd ../web && npm install && npm run build # produces web/dist, served by the API
```

Required production values: `NODE_ENV=production`, `PUBLIC_URL=https://notify.yourdomain.com`, `HOST=127.0.0.1`, `SESSION_SECRET`, `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (sign in, change the password in Settings, then remove it from `.env`), and `ADMIN_NOTIFY_EMAILS`.

## 5. Start with PM2 and keep it running across reboots

```bash
cd ~/notify
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup launchd          # prints a sudo command: run it; PM2 now starts at boot
pm2 status                   # notify-api and notify-worker online
curl -s localhost:4000/healthz
```

Migrations run automatically when the processes start.

## 6. Cloudflare Tunnel, DNS and HTTPS

Your domain must use Cloudflare nameservers.

```bash
cloudflared tunnel login                         # opens a browser; pick your domain
cloudflared tunnel create notify                 # prints the TUNNEL_ID and writes ~/.cloudflared/<TUNNEL_ID>.json
cloudflared tunnel route dns notify notify.yourdomain.com   # creates the proxied CNAME automatically
cp deploy/cloudflared-config.yml ~/.cloudflared/config.yml  # edit hostname, user name and TUNNEL_ID
cloudflared tunnel run notify                    # test in the foreground, then Ctrl-C
sudo cloudflared service install                 # run as a launchd service at boot
```

> `sudo cloudflared service install` runs as root and reads its config from `/etc/cloudflared/`. Copy `config.yml` and the credentials JSON there, or run `cloudflared tunnel run notify` under PM2 as your user instead: `pm2 start cloudflared --name tunnel -- tunnel run notify && pm2 save`.

**Cloudflare dashboard settings** (for your domain):

| Setting | Value |
|---|---|
| DNS | `notify` CNAME → `<TUNNEL_ID>.cfargotunnel.com`, **Proxied** (orange cloud), created by `route dns` |
| SSL/TLS → Edge certificates | **Always Use HTTPS**: on · **Minimum TLS**: 1.2 · **HSTS**: on once confirmed working |
| SSL/TLS mode | *Full* (the tunnel encrypts the hop to the origin) |
| Security → WAF → Rate limiting rule | `/api/auth/login`: 20 requests/min per IP → Block |
| Security → WAF → Custom rule (optional) | Block countries you don't operate in, **except** for the path `/webhooks/whatsapp` (Meta calls it from US data centres) |
| **Zero Trust → Access** (strongly recommended) | Application for `notify.yourdomain.com` that requires login with your Google account or an email code, with a **Bypass** policy for the path `/webhooks/*` so Meta can still reach the webhook. This adds a second login in front of the dashboard. |
| Caching | Default is fine. `/api/*` responses are not cached (JSON). |

## 7. Connect WhatsApp to the webhook

In the Meta app → WhatsApp → Configuration → Webhook: callback URL `https://notify.yourdomain.com/webhooks/whatsapp` and verify token = `WHATSAPP_VERIFY_TOKEN`. Click **Verify and save**, then subscribe to **messages**. In the dashboard's Settings page, send a test with template `hello_world` to your own number.

## 8. Backups, logs, monitoring

```bash
crontab -e
# 15 2 * * * DATABASE_URL=postgres://notify:PASS@127.0.0.1/notify /Users/YOU/notify/deploy/backup.sh >> /usr/local/var/log/notify/backup.log 2>&1
sudo cp deploy/newsyslog-notify.conf /etc/newsyslog.d/notify.conf   # rotate logs, 14 × 20 MB
```

- **Off-machine backups**: copy `~/notify-backups` to iCloud Drive, an external disk (Time Machine), or S3/R2 with `rclone`. The audit log is only as durable as its backups.
- **Logs**: JSON lines (pino) in `/usr/local/var/log/notify/`. Use `pm2 logs`, or `tail -f … | npx pino-pretty`.
- **Uptime**: add an external monitor (UptimeRobot, Better Stack or Healthchecks.io) on `https://notify.yourdomain.com/healthz`. It returns 503 when the database is down. With Cloudflare Access on, add a bypass for `/healthz`.
- **Dashboards**: `pm2 monit` for CPU/memory. Optionally `pm2 install pm2-logrotate`, or ship logs with Grafana Alloy / Vector to Grafana Cloud or Better Stack.
- **Alerts on failed sends** are built in: the consolidated report is emailed to `ADMIN_NOTIFY_EMAILS` after every run that has failures, and when a run fails entirely.

## 9. Updating

```bash
cd ~/notify && git pull
cd server && npm install && cd ../web && npm install && npm run build
pm2 restart notify-api notify-worker
```

The worker finishes the message it's sending before it stops (30 s grace period). If it's killed mid-run, the next start resumes the run. Messages that were in flight are marked failed rather than re-sent, so nobody gets a duplicate.

## Capacity on an M4 Pro

The admin dashboard is used by a handful of people, so 100–500 concurrent sessions is easy: one Node process serves thousands of requests per second for these queries, and PostgreSQL connections are pooled (`DB_POOL_MAX=10` per process). The real limits are external:

| Limit | Typical value |
|---|---|
| WhatsApp Cloud API throughput | ~80 messages/sec per number (default `WHATSAPP_CONCURRENCY=5` is ~20–40/sec) |
| WhatsApp daily cap (messaging tier) | 250 → 1K → 10K → 100K unique recipients per 24 h, rising automatically with good quality |
| Gmail / Workspace SMTP | ~2,000/day; use SES/Postmark for more |

A 5,000-contact list takes roughly 3–5 minutes for WhatsApp, plus email time at your provider's rate.
