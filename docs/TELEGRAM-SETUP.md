# Telegram channel

Telegram is a full channel next to WhatsApp and email. **Each person gets one chat message plus email:**

| Person | Chat message | Email |
|---|---|---|
| Has joined the Telegram bot | **Telegram** | yes, if they have one |
| Has not joined Telegram, WhatsApp is on | **WhatsApp** | yes, if they have one |
| Has not joined Telegram, WhatsApp is off | none (recorded as skipped, or as failed if they have no email either) | yes, if they have one |

When both chat channels are available, **Telegram + email is the priority**, and WhatsApp is the fallback for people who haven't joined the bot. Sending order: the whole Telegram list, then the WhatsApp list, then the email list.

This covers everything: the quarterly notice, the reminders, the privacy notice, balance replies and inbox replies. Replies always go back on the channel the person wrote from. Telegram needs **no business verification, no template approval and has no 24-hour reply window**.

## The one difference: residents must join the bot

A Telegram bot **cannot message someone by phone number, and cannot message anyone first**. Each resident has to:
1. Open the bot link (or scan its QR code).
2. Tap **Start**.
3. Tap **Share my phone number**.

The app matches that number to the **Mobile** column of your sheet and links the chat to their unit. From then on, the building can message them at any time.

- **Not joined yet, but has an email**: they still get the email. The Telegram line is recorded as *skipped*.
- **Not joined and no email**: recorded as *failed* ("not reachable"), so they appear in the failure report after each send.
- **Contacts & source** has a **Telegram** column showing who has joined, and the dashboard shows the count.
- Only the person's **own** number is accepted. Telegram tells the bot whether a shared contact belongs to the sender, and someone else's contact card is refused.
- If someone **blocks the bot**, their next message fails, the link is marked *blocked*, and they appear in the failure report. If they message the bot again, the link reopens.

## 1. Create the bot (5 minutes, on your phone)

1. In Telegram, open **@BotFather** (the blue-tick official account) and send `/newbot`.
2. **Name**: `The Manhattan Residence JMB`
3. **Username** (must end in `bot`): e.g. `ManhattanResidenceJMB_bot`
4. BotFather replies with a **token** like `123456789:AA…`. **This token is a password.** Don't share it in chat or put it on GitHub; type it straight into the server's `.env` file.
5. Optional but recommended, also in BotFather:
   - `/setdescription`: *Official notifications from the Joint Management Body (JMB) of The Manhattan Residence: maintenance charges, reminders and account balance.*
   - `/setuserpic`: the building logo
   - `/setcommands`:
     ```
     start - Link this chat to your unit
     balance - Check your account balance
     ```
   - `/setjoingroups` → **Disable** (the bot only works in private chats)

## 2. Connect it to the app

In `server/.env` on the Mac mini:

```
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456789:AA…your token…
WHATSAPP_ENABLED=false     # until Meta approves your templates
```

Restart the worker: `pm2 restart notify-worker`. The worker fetches new Telegram messages itself (long polling), so **Telegram needs no webhook and no public URL**. It works even before Cloudflare is set up.

Check **Settings** in the dashboard: it shows *Chat channels: Telegram* and the bot's `t.me/…` link. Send yourself a test: Settings → Send a test → Telegram → your number (after you've joined the bot yourself).

With `TELEGRAM_BOT_TOKEN` empty, the app runs Telegram in **mock mode**: nothing is sent, which is useful for trying things out.

## 3. Invite the residents

Send this once, by email, in the residents' group chat, or on the notice board with a QR code of the link. Replace the link with your bot's.

> **The Manhattan Residence: JMB notifications on Telegram**
>
> Dear residents and unit owners,
>
> The Joint Management Body (JMB) now sends maintenance charge notices, payment reminders and account balances through Telegram.
>
> To join: open **https://t.me/ManhattanResidenceJMB_bot**, tap **Start**, then tap **Share my phone number**. Please use the mobile number registered with the Management Office.
>
> Once joined, you can send **"balance"** to the bot at any time to check your account.
>
> ---
>
> **The Manhattan Residence: Notifikasi JMB melalui Telegram**
>
> Kepada penghuni dan pemilik unit,
>
> Badan Pengurusan Bersama (JMB) kini menghantar notis caj penyelenggaraan, peringatan bayaran dan baki akaun melalui Telegram.
>
> Untuk menyertai: buka **https://t.me/ManhattanResidenceJMB_bot**, tekan **Start**, kemudian tekan **Share my phone number**. Sila gunakan nombor telefon bimbit yang didaftarkan dengan Pejabat Pengurusan.
>
> Selepas menyertai, anda boleh menghantar **"baki"** kepada bot pada bila-bila masa untuk menyemak akaun anda.

The bot's own messages (welcome, "linked to Unit A-12-03", etc.) are bilingual and can be edited under **Automations → Telegram bot**.

## What residents see

1. **/start** → welcome message + a **Share my phone number** button
2. **Share** →
   - *Resident in the sheet*: "This chat is now linked to Unit A-12-03…"
   - *Number not in the sheet*: the bilingual **Personal Data Protection Notice** (Act 709 / Act A1727), YES/YA or NO/TIDAK, recorded under **Privacy consents**
3. Notices and reminders arrive as normal Telegram messages. They use the **same wording** as the WhatsApp templates, including the bank details.
4. **"balance" / "baki" / /balance** → their latest statement from the sheet.
5. Anything else they write appears under **Replies**, where you can answer them.

## Limits

| | Telegram |
|---|---|
| Messages per second | ~30 overall (`TELEGRAM_CONCURRENCY=5` is safe) |
| Message length | 4,096 characters (the longest message is ~2,700) |
| Cost | free |
| Template approval | none: edit messages in the dashboard any time |

## Adding WhatsApp later

1. Finish Meta setup and get the four templates approved (`docs/TEMPLATES-MANHATTAN-RESIDENCE.md`).
2. In `.env`: `WHATSAPP_ENABLED=true` plus the `WHATSAPP_*` values, then `pm2 restart notify-api notify-worker`.

Telegram stays on. Residents who joined the bot keep getting Telegram, and everyone else gets WhatsApp. Settings shows *Chat channels: Telegram first, then WhatsApp*. To stop using Telegram, set `TELEGRAM_ENABLED=false`. Templates, reminders, consents, inbox history and the audit log are unaffected, because people are tracked by phone number on every channel.
