# The Manhattan Residence: message templates and automations

Everything below is already loaded into the app by one command (see **Load into the app**). This document is the reference copy, and the source for the WhatsApp templates you submit to Meta.

## 1. The spreadsheet

One row per unit. Header names are matched loosely (case and spacing don't matter). Example: [`sample-manhattan-dues.csv`](sample-manhattan-dues.csv)

| Column | Example | Used for |
|---|---|---|
| **Name** | Ana Cruz | greeting (`{{name}}`, `{{first_name}}`) |
| **Unit** | 12A | `{{unit}}` |
| **WhatsApp** | 0917 111 2222 | WhatsApp messages (local numbers get +63) |
| **Email** | ana@example.com | email messages |
| **Status** | Unpaid / Paid | picks the message; **change to Paid when they pay** to stop reminders |
| **Billing Period** | Q4 2026 (Oct–Dec) | `{{billing_period}}` |
| **Amount** | 12,450.00 | upcoming quarterly dues (`{{amount_formatted}}`) |
| **Previous Unpaid** | 3,200.00 (blank = 0) | `{{previous_unpaid_formatted}}` |
| **Due Date** | 10/15/2026 | due date, and the reminder clock |

Calculated by the app (no column needed):

| Variable | Meaning | Example |
|---|---|---|
| `{{total_due_formatted}}` | Amount + Previous Unpaid | 15,650.00 |
| `{{due_date_formatted}}` | due date written out | October 15, 2026 |
| `{{days_overdue}}` | days since the due date (0 if not yet due) | 14 |
| `{{due_status}}` | plain wording | "overdue by 14 days", "due today", "due in 3 days" |

Set `AMOUNT_CURRENCY=PHP` and `AMOUNT_LOCALE=en-PH` in `server/.env` so amounts show as **₱15,650.00**.

## 2. How each use case works

| # | Use case | Trigger | Who gets it |
|---|---|---|---|
| 1 | Quarterly bill notice | You click **Send now** or schedule it (Send & schedule) | Rows with Status **Unpaid**. Rows marked **Paid** are skipped and recorded as skipped. |
| 2 | Reminders at due date **+5, +14, +30 days** | Automatic daily check (Automations → Overdue reminders, default 09:00 Manila time) | Rows whose Status is **still Unpaid** after re-reading the sheet. Each reminder is sent **once per bill**. If the app was off on day 5, it sends the reminder for the latest stage reached (e.g. day 16 → the +14 reminder only). |
| 3 | Data Privacy Notice | Someone **not in the sheet** sends a WhatsApp message for the first time | That person. Their YES or NO is recorded under **Privacy consents** (exportable to CSV) and in the audit log. |
| 4 | Balance inquiry | A resident in the sheet messages words like *balance, bill, dues, magkano, how much, SOA, utang* (WhatsApp or email) | That resident: the sheet is re-read first, and the reply shows the amounts and how many days overdue. An owner with several units gets one section per unit. |

Messages 1 and 2 are started by the building, so **WhatsApp requires Meta-approved templates** for them (below). Messages 3 and 4 are replies to someone who just wrote in, so they are free text and **need no Meta approval**. They can be edited any time under **Automations**.

## 3. WhatsApp templates to submit to Meta (use cases 1 and 2)

In **WhatsApp Manager → Message templates → Create template**, choose **Utility** and the language **English**. Name and body must match exactly. Meta usually approves Utility templates within minutes to a day.

### 1. Quarterly association dues notice

| Field in Meta | Value |
|---|---|
| Template name | `tmr_quarterly_dues_notice` |
| Category | **Utility** |
| Language | English (`en`) |
| Used for | app template `unpaid` |

**Body** (paste exactly):

```
Good day, {{1}}!

This is a billing notice from The Manhattan Residence Administration Office for the association dues of Unit {{2}} covering {{3}}.

Upcoming quarterly dues: {{4}}
Previous unpaid balance: {{5}}
Total amount due: {{6}}
Due date: {{7}}

Kindly settle on or before the due date. For payment options or questions, simply reply to this message. Thank you.
```

**Variable samples** (Meta asks for one example per variable):

| Variable | Filled from sheet | Sample |
|---|---|---|
| `{{1}}` | `name` | Ana Cruz |
| `{{2}}` | `unit` | 12A |
| `{{3}}` | `billing_period` | Q4 2026 (Oct–Dec) |
| `{{4}}` | `amount_formatted` | ₱12,450.00 |
| `{{5}}` | `previous_unpaid_formatted` | ₱3,200.00 |
| `{{6}}` | `total_due_formatted` | ₱15,650.00 |
| `{{7}}` | `due_date_formatted` | October 15, 2026 |

**Email version**: subject `Association Dues Notice – Unit {{unit}} – {{billing_period}}`

```
Dear {{name}},

Good day! This is a billing notice from The Manhattan Residence Administration Office for the association dues of Unit {{unit}} covering {{billing_period}}.

    Upcoming quarterly dues:   {{amount_formatted}}
    Previous unpaid balance:   {{previous_unpaid_formatted}}
    TOTAL AMOUNT DUE:          {{total_due_formatted}}
    Due date:                  {{due_date_formatted}}

Kindly settle your dues on or before the due date. For payment options or any questions about your statement, simply reply to this email or visit the Administration Office.

If you have already paid, please disregard this notice.

Thank you,
The Manhattan Residence Administration Office
```

### 2a. First reminder – due date + 5 days

| Field in Meta | Value |
|---|---|
| Template name | `tmr_dues_reminder_first` |
| Category | **Utility** |
| Language | English (`en`) |
| Used for | app template `reminder_5` |

**Body** (paste exactly):

```
Hello {{1}}, this is a friendly reminder from The Manhattan Residence Administration Office.

Our records show that the association dues for Unit {{2}} are still unpaid. The due date was {{3}}, so the account is now {{4}} days past due.

Total amount due: {{5}}

Please settle at your earliest convenience. If you have already paid, kindly reply with your proof of payment so we can update your account. Thank you.
```

**Variable samples** (Meta asks for one example per variable):

| Variable | Filled from sheet | Sample |
|---|---|---|
| `{{1}}` | `name` | Ana Cruz |
| `{{2}}` | `unit` | 12A |
| `{{3}}` | `due_date_formatted` | October 15, 2026 |
| `{{4}}` | `days_overdue` | 5 |
| `{{5}}` | `total_due_formatted` | ₱15,650.00 |

**Email version**: subject `Payment Reminder – Unit {{unit}} association dues are {{days_overdue}} days past due`

```
Dear {{name}},

This is a friendly reminder from The Manhattan Residence Administration Office.

Our records show that the association dues for Unit {{unit}} are still unpaid. The due date was {{due_date_formatted}}, so the account is now {{days_overdue}} days past due.

    TOTAL AMOUNT DUE:  {{total_due_formatted}}

Please settle at your earliest convenience. If you have already paid, kindly reply to this email with your proof of payment so we can update your account.

Thank you,
The Manhattan Residence Administration Office
```

### 2b. Second reminder – due date + 14 days

| Field in Meta | Value |
|---|---|
| Template name | `tmr_dues_reminder_second` |
| Category | **Utility** |
| Language | English (`en`) |
| Used for | app template `reminder_14` |

**Body** (paste exactly):

```
Hello {{1}}, this is a second reminder from The Manhattan Residence Administration Office.

The association dues for Unit {{2}} remain unpaid and are now {{3}} days past the {{4}} due date.

Total amount due: {{5}}

We kindly ask that you settle this balance as soon as possible to keep your account in good standing. If payment has already been made, please reply with your proof of payment. Thank you.
```

**Variable samples** (Meta asks for one example per variable):

| Variable | Filled from sheet | Sample |
|---|---|---|
| `{{1}}` | `name` | Ana Cruz |
| `{{2}}` | `unit` | 12A |
| `{{3}}` | `days_overdue` | 14 |
| `{{4}}` | `due_date_formatted` | October 15, 2026 |
| `{{5}}` | `total_due_formatted` | ₱15,650.00 |

**Email version**: subject `Second Reminder – Unit {{unit}} association dues are {{days_overdue}} days overdue`

```
Dear {{name}},

This is a second reminder from The Manhattan Residence Administration Office.

The association dues for Unit {{unit}} remain unpaid and are now {{days_overdue}} days past the {{due_date_formatted}} due date.

    TOTAL AMOUNT DUE:  {{total_due_formatted}}

We kindly ask that you settle this balance as soon as possible to keep your account in good standing. If payment has already been made, please reply to this email with your proof of payment.

Thank you,
The Manhattan Residence Administration Office
```

### 2c. Final notice – due date + 30 days

| Field in Meta | Value |
|---|---|
| Template name | `tmr_dues_final_notice` |
| Category | **Utility** |
| Language | English (`en`) |
| Used for | app template `final_30` |

**Body** (paste exactly):

```
FINAL NOTICE: Hello {{1}}, the association dues for Unit {{2}} at The Manhattan Residence remain unpaid and are now {{3}} days past the {{4}} due date.

Total amount due: {{5}}

Please settle the full amount immediately, or contact the Administration Office to discuss your account. Unpaid accounts may be subject to the penalties and measures set out in the Association's by-laws. If you have already paid, please reply with your proof of payment. Thank you.
```

**Variable samples** (Meta asks for one example per variable):

| Variable | Filled from sheet | Sample |
|---|---|---|
| `{{1}}` | `name` | Ana Cruz |
| `{{2}}` | `unit` | 12A |
| `{{3}}` | `days_overdue` | 30 |
| `{{4}}` | `due_date_formatted` | October 15, 2026 |
| `{{5}}` | `total_due_formatted` | ₱15,650.00 |

**Email version**: subject `FINAL NOTICE – Unit {{unit}} association dues {{days_overdue}} days overdue`

```
Dear {{name}},

FINAL NOTICE

The association dues for Unit {{unit}} at The Manhattan Residence remain unpaid and are now {{days_overdue}} days past the {{due_date_formatted}} due date.

    TOTAL AMOUNT DUE:  {{total_due_formatted}}

Please settle the full amount immediately, or contact the Administration Office to discuss your account. Unpaid accounts may be subject to the penalties and measures set out in the Association's by-laws.

If you have already paid, please reply to this email with your proof of payment so we can update our records.

The Manhattan Residence Administration Office
```

## 4. Data Privacy Notice (use case 3), free text

**Notice** (sent automatically to an unknown sender's first message):

```
Good day! Thank you for messaging The Manhattan Residence Administration Office.

DATA PRIVACY NOTICE
In compliance with the Data Privacy Act of 2012 (Republic Act No. 10173), please be informed that we collect and process your name, mobile number and the messages you send us solely to respond to your inquiry and to manage communications with the residents and unit owners of The Manhattan Residence. Your information is kept confidential, stored securely, accessed only by authorized administration staff, and not shared with third parties unless required by law. You may ask to access, correct or delete your information at any time by contacting the Administration Office.

Do you agree? Please reply YES or NO.
```

| Their answer | Recognised words | Reply |
|---|---|---|
| YES | yes, y, oo, opo, agree, i agree, accept, sige | Thank you! Your consent has been recorded. How may we help you today? If you are a unit owner or resident, please send your full name and unit number so we can assist you. |
| NO | no, n, hindi, ayaw, ayoko, decline, disagree, i do not agree, i don't agree | Thank you for your response. We have recorded that you do not consent, and we will not process your personal information further. For any concern, you may visit the Administration Office in person. |
| anything else | – | Sorry, we didn't catch that. Please reply YES if you agree to our Data Privacy Notice, or NO if you do not. |

**Have your Data Protection Officer or lawyer review this notice before going live.** It's a reasonable starting point under RA 10173, but it should name your actual DPO contact and match your real retention practice.

## 5. Balance inquiry replies (use case 4), free text

Trigger words: balance, bill, billing, dues, how much, magkano, outstanding, statement, soa, unpaid, utang, bayarin

**Unpaid account:**
```
Hello {{first_name}}, here is the latest statement for Unit {{unit}} of The Manhattan Residence:

Quarterly dues ({{billing_period}}): {{amount_formatted}}
Previous unpaid balance: {{previous_unpaid_formatted}}
Total amount due: {{total_due_formatted}}
Due date: {{due_date_formatted}} ({{due_status}})

Please settle your balance as soon as possible. If you have already paid, kindly send us your proof of payment so we can update your account. Thank you!
```
**Paid account:**
```
Hello {{first_name}}, Unit {{unit}} has no unpaid association dues as of today. Thank you for your prompt payment!
```
**Number/email not in the sheet:**
```
We could not find a unit account linked to this number. Please send your full name and unit number, and the Administration Office will assist you.
```

Example. Ben (Unit 8C) writes *"Good morning! Magkano po balance ko?"* and automatically receives:
```
Hello Ben, here is the latest statement for Unit 8C of The Manhattan Residence:

Quarterly dues (Q4 2026 (Oct–Dec)): ₱9,800.00
Previous unpaid balance: ₱9,800.00
Total amount due: ₱19,600.00
Due date: September 30, 2026 (overdue by 6 days)

Please settle your balance as soon as possible. If you have already paid, kindly send us your proof of payment so we can update your account. Thank you!
```

## 6. Load into the app and switch on

```bash
cd server
npm run seed -- seeds/manhattan-residence.json            # adds the templates and automation texts
npm run seed -- seeds/manhattan-residence.json --force    # (only if you want to overwrite edited versions)
```

Then in the dashboard:
1. **Contacts & source**: connect the Google Sheet (or upload the file).
2. **Templates**: review the wording. After Meta approves the WhatsApp templates, nothing else is needed, because the template names already match.
3. **Send & schedule**: schedule the quarterly bill notice (e.g. monthly on day 1, or one-time per quarter).
4. **Automations**: tick *Send reminders automatically every day*, *Send the privacy notice*, and *Answer balance questions automatically*. Use **Due for a reminder today** and **Try it** to preview before turning them on.

## Before going live, please confirm
- **Payment options**: the messages say "reply to this message" for payment options. If you prefer to list bank / GCash / Maya details directly, tell me and I'll add them (WhatsApp templates must be re-approved after any change).
- **Final notice wording**: it mentions "penalties and measures set out in the Association's by-laws". Keep it only if your by-laws provide for them.
- **Privacy notice**: review by your DPO, as noted above.
