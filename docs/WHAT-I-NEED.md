# What I need from you

The app runs today in **mock mode**, which sends nothing real. To go live, set up the items below and put the values in `server/.env` on the Mac mini. **Don't paste secrets (tokens, passwords) into chat or GitHub.** Type them into `.env` directly on the machine.

## 0. Telegram (to start now)

Telegram is a permanent channel: residents who join the bot get their messages on Telegram, and everyone else gets WhatsApp once it's approved. All it needs is a **bot token from @BotFather**. See [TELEGRAM-SETUP.md](TELEGRAM-SETUP.md) for the 5-minute setup and the invitation text for residents.

## 1. WhatsApp: Meta WhatsApp Business Platform (Cloud API)

The official API is the only reliable, ban-safe way to send bulk WhatsApp messages. "WhatsApp Web" automation tools violate WhatsApp's terms and get numbers banned.

**Decisions only you can make**
- **Which phone number sends the messages?** It must be a number that is **not** active in the regular WhatsApp or WhatsApp Business *app*. You can use a new SIM/virtual number, or migrate an existing one, which removes it from the app. It must be able to receive an SMS or voice call for verification.
- **Display name** shown to recipients (Meta reviews it; it must match your business).

**Steps**
1. Create or locate your **Meta Business Portfolio** (business.facebook.com) and complete **business verification**. Unverified accounts are limited to 250 business-initiated conversations per 24 hours.
2. At developers.facebook.com, **create an app** of type *Business* and add the **WhatsApp** product.
3. Under WhatsApp → API Setup, **add your phone number** and verify it.
4. Create a **System User** (Business Settings → Users → System users), assign it the app and the WhatsApp account, and generate a **permanent access token** with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
5. **Create message templates** in WhatsApp Manager, one per status type (e.g. `payment_overdue`, `payment_reminder`), category **Utility**. Write them with numbered variables:
   > Hi {{1}}, your balance of {{2}} was due on {{3}}. Reply to this message if you have questions.

   Then in Notify's template editor, enter the template name, its language code (e.g. `en_US`) and the variable mapping `name, amount_formatted, due_date`. **Business-initiated WhatsApp messages can only use approved templates.** Free-text messages are only accepted within 24 hours of the contact messaging you, which is what the Replies inbox uses.
6. Under **Webhooks**: callback URL `https://<your-domain>/webhooks/whatsapp`, verify token = any random string (the same value goes in `WHATSAPP_VERIFY_TOKEN`). Subscribe to the **messages** field.
7. Add a payment method in WhatsApp Manager. Meta charges per delivered template message, and the price depends on the recipient's country.

**Values for `.env`**
| Variable | Where to find it |
|---|---|
| `WHATSAPP_PROVIDER=meta` | |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup (the *Phone number ID*, not the phone number) |
| `WHATSAPP_ACCESS_TOKEN` | System User permanent token (step 4) |
| `WHATSAPP_APP_SECRET` | App → Settings → Basic → App secret (used to verify webhook signatures) |
| `WHATSAPP_VERIFY_TOKEN` | The random string you chose in step 6 |

## 2. Email

**Decisions**
- **Sending address**, e.g. `billing@yourdomain.com`. Replies must arrive in a mailbox the app can read.
- **Provider**: Google Workspace or Microsoft 365 (fine for a few hundred emails a day), or a transactional service (Amazon SES, Postmark, Mailgun, SendGrid; better for thousands a day). All of them offer SMTP.

**For Google Workspace / Gmail** (simplest):
1. Turn on 2-Step Verification for the sending account.
2. Create an **App Password** (Google Account → Security → App passwords).
3. Use:
   ```
   EMAIL_PROVIDER=smtp
   EMAIL_FROM="Your Company <billing@yourdomain.com>"
   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_SECURE=true
   SMTP_USER=billing@yourdomain.com  SMTP_PASS=<app password>
   IMAP_ENABLED=true  IMAP_HOST=imap.gmail.com  IMAP_USER=billing@yourdomain.com  IMAP_PASS=<app password>
   ```
   Gmail limits Workspace accounts to about 2,000 messages a day.
4. Make sure the domain has **SPF, DKIM and DMARC** DNS records (in Cloudflare DNS). Without them, emails land in spam.

## 3. Google Sheets (only if you use a link instead of uploading)

Pick one:
- **Simple**: share the sheet as *Anyone with the link → Viewer*. Nothing else to configure.
- **Private** (recommended for personal data, and in line with the PDPA's security principle): in Google Cloud, create a project, enable the **Google Sheets API**, create a **service account** and download its JSON key to the Mac mini (e.g. `~/notify/service-account.json`, which git ignores). Set `GOOGLE_SERVICE_ACCOUNT_FILE` to that path, then share the sheet with the service account's email as Viewer.

**Required columns** (header row; case and spaces don't matter): `Name`, `Status`, `Amount`, plus `WhatsApp` (or `Phone`/`Mobile`) and/or `Email`. Any extra column (e.g. `Due Date`) can be used in templates as `{{due_date}}`.

## 4. Everything else

| Item | Example | Why |
|---|---|---|
| **Domain on Cloudflare** | `notify.yourdomain.com` | public HTTPS address for the dashboard and the WhatsApp webhook |
| **Country code** for local numbers | `60` (Malaysia) | turns `012-345 6789` into `60123456789` |
| **Currency / number format** | `AMOUNT_CURRENCY=MYR`, `AMOUNT_LOCALE=en-MY` | `{{amount_formatted}}` → RM 1,245.00 |
| **Time zone** | `Asia/Kuala_Lumpur` | schedules and dashboard dates |
| **Admin email(s) for failure reports** | `ops@yourdomain.com` | consolidated report after each run |
| **Admin login** | email + strong password | first dashboard account |
| **Your status types and template wording** | `overdue`, `reminder`, … | so the templates can be set up (and submitted to Meta) |
