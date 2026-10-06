# The Manhattan Residence (Malaysia): message templates and automations

Everything below is already loaded into the app by one command (see **Load into the app**). This document is the reference copy, and the source for the WhatsApp templates you submit to Meta.

**Terminology** follows Malaysian strata usage: the **Joint Management Body (JMB)** bills **maintenance charges and sinking fund**, and earlier unpaid amounts are **arrears**.

## 1. The spreadsheet

One row per unit. Header names are matched loosely (case and spacing don't matter). Example: [`sample-manhattan-dues.csv`](sample-manhattan-dues.csv)

| Column | Example | Used for |
|---|---|---|
| **Name** | Aisyah Rahman | greeting (`{{name}}`, `{{first_name}}`) |
| **Unit** | A-12-03 | `{{unit}}` |
| **WhatsApp** | 012-111 2222 | WhatsApp messages (local numbers get +60) |
| **Email** | aisyah@example.com | email messages |
| **Status** | Unpaid / Paid | picks the message; **change to Paid when they pay** to stop reminders |
| **Billing Period** | Q4 2026 (Oct–Dec) | `{{billing_period}}` |
| **Maintenance & Sinking Fund** | 1,245.00 | this quarter's maintenance charges and sinking fund (`{{amount_formatted}}`). A column named *Amount* or *Maintenance Charges* also works. |
| **Arrears** | 320.00 (blank = 0) | unpaid amount from earlier bills (`{{previous_unpaid_formatted}}`). *Previous Unpaid* or *Tunggakan* also works. |
| **Due Date** | 15/10/2026 (DD/MM/YYYY) | due date, and the reminder clock |

Calculated by the app (no column needed):

| Variable | Meaning | Example |
|---|---|---|
| `{{total_due_formatted}}` | Maintenance & Sinking Fund + Arrears | RM 1,565.00 |
| `{{due_date_formatted}}` | due date written out | 15 October 2026 |
| `{{days_overdue}}` | days since the due date (0 if not yet due) | 14 |
| `{{due_status}}` | plain wording | "overdue by 14 days", "due today", "due in 3 days" |

Malaysian settings in `server/.env` (already the defaults in `.env.example`):

```
APP_TIMEZONE=Asia/Kuala_Lumpur
DEFAULT_COUNTRY_CODE=60
AMOUNT_CURRENCY=MYR
AMOUNT_LOCALE=en-MY
DATE_FORMAT=DMY
```

## Payment details used in every message

The bill notice, all three reminders (WhatsApp and email) and the balance reply include:

```
Bank: Public Bank
Account name: BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
Account no.: 3214-1858-04
Reference: unit number
```

The account details are fixed text inside the WhatsApp templates, so **if the bank account ever changes, the four templates must be edited and re-approved by Meta.** The balance reply and the emails can be edited in the dashboard at any time.

## 2. How each use case works

| # | Use case | Trigger | Who gets it |
|---|---|---|---|
| 1 | Quarterly maintenance charges & sinking fund notice | You click **Send now** or schedule it (Send & schedule) | Rows with Status **Unpaid**. Rows marked **Paid** are skipped and recorded as skipped. |
| 2 | Reminders at due date **+5, +14, +30 days** | Automatic daily check (Automations → Overdue reminders, default 09:00 Malaysia time) | Rows whose Status is **still Unpaid** after re-reading the sheet. Each reminder is sent **once per bill**. If the app was off on day 5, it sends the reminder for the latest stage reached (e.g. day 16 → the +14 reminder only). |
| 3 | Personal Data Protection Notice (bilingual) | Someone **not in the sheet** sends a WhatsApp message for the first time | That person. Their YES/YA or NO/TIDAK is recorded under **Privacy consents** (exportable to CSV) and in the audit log. |
| 4 | Balance inquiry | A resident in the sheet messages words like *balance, bill, dues, how much, SOA, baki, bil, yuran, tunggakan, berapa* (WhatsApp or email) | That resident: the sheet is re-read first, and the reply shows the amounts and how many days overdue. An owner with several units gets one section per unit. |

Messages 1 and 2 are started by the building, so **WhatsApp requires Meta-approved templates** for them (below). Messages 3 and 4 are replies to someone who just wrote in, so they are free text and **need no Meta approval**. They can be edited any time under **Automations**.

## 3. WhatsApp templates to submit to Meta (use cases 1 and 2)

In **WhatsApp Manager → Message templates → Create template**, choose **Utility** and the language **English**. Name and body must match exactly. Meta usually approves Utility templates within minutes to a day.

### 1. Quarterly maintenance charges & sinking fund notice

| Field in Meta | Value |
|---|---|
| Template name | `tmr_maintenance_charges_notice` |
| Category | **Utility** |
| Language | English (`en`) |
| Used for | app template `unpaid` |

**Body** (paste exactly):

```
Good day, {{1}}!

This is a billing notice from the Joint Management Body (JMB) of The Manhattan Residence for the maintenance charges and sinking fund of Unit {{2}} for {{3}}.

Maintenance charges & sinking fund: {{4}}
Arrears: {{5}}
Total amount due: {{6}}
Due date: {{7}}

Kindly settle on or before the due date.

Payment by bank transfer:
Bank: Public Bank
Account name: BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
Account no.: 3214-1858-04
Please use your unit number as the payment reference.

After paying, please reply with your proof of payment. For questions, simply reply to this message. Thank you.
```

**Variable samples** (Meta asks for one example per variable):

| Variable | Filled from sheet | Sample |
|---|---|---|
| `{{1}}` | `name` | Aisyah Rahman |
| `{{2}}` | `unit` | A-12-03 |
| `{{3}}` | `billing_period` | Q4 2026 (Oct–Dec) |
| `{{4}}` | `amount_formatted` | RM 1,245.00 |
| `{{5}}` | `previous_unpaid_formatted` | RM 320.00 |
| `{{6}}` | `total_due_formatted` | RM 1,565.00 |
| `{{7}}` | `due_date_formatted` | 15 October 2026 |

**Email version**: subject `Maintenance Charges & Sinking Fund – Unit {{unit}} – {{billing_period}}`

```
Dear {{name}},

Good day! This is a billing notice from the Joint Management Body (JMB) of The Manhattan Residence for the maintenance charges and sinking fund of Unit {{unit}} for {{billing_period}}.

    Maintenance charges & sinking fund:  {{amount_formatted}}
    Arrears:                             {{previous_unpaid_formatted}}
    TOTAL AMOUNT DUE:                    {{total_due_formatted}}
    Due date:                            {{due_date_formatted}}

Kindly settle on or before the due date.

    Payment by bank transfer
    Bank:          Public Bank
    Account name:  BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
    Account no.:   3214-1858-04
    Reference:     your unit number (Unit {{unit}})

After paying, please reply to this email with your proof of payment. For any questions about your statement, simply reply to this email or visit the Management Office.

If you have already paid, please disregard this notice.

Thank you,
The Joint Management Body (JMB)
The Manhattan Residence
```

### 2a. First reminder – due date + 5 days

| Field in Meta | Value |
|---|---|
| Template name | `tmr_maintenance_reminder_first` |
| Category | **Utility** |
| Language | English (`en`) |
| Used for | app template `reminder_5` |

**Body** (paste exactly):

```
Hello {{1}}, this is a friendly reminder from the Joint Management Body (JMB) of The Manhattan Residence.

Our records show that the maintenance charges and sinking fund for Unit {{2}} are still outstanding. The due date was {{3}}, so the account is now {{4}} days overdue.

Total amount due: {{5}}

Payment by bank transfer:
Bank: Public Bank
Account name: BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
Account no.: 3214-1858-04
Please use your unit number as the payment reference.

Please settle at your earliest convenience. If you have already paid, kindly reply with your proof of payment so we can update your account. Thank you.
```

**Variable samples** (Meta asks for one example per variable):

| Variable | Filled from sheet | Sample |
|---|---|---|
| `{{1}}` | `name` | Aisyah Rahman |
| `{{2}}` | `unit` | A-12-03 |
| `{{3}}` | `due_date_formatted` | 15 October 2026 |
| `{{4}}` | `days_overdue` | 5 |
| `{{5}}` | `total_due_formatted` | RM 1,565.00 |

**Email version**: subject `Payment Reminder – Unit {{unit}} maintenance charges & sinking fund {{days_overdue}} days overdue`

```
Dear {{name}},

This is a friendly reminder from the Joint Management Body (JMB) of The Manhattan Residence.

Our records show that the maintenance charges and sinking fund for Unit {{unit}} are still outstanding. The due date was {{due_date_formatted}}, so the account is now {{days_overdue}} days overdue.

    TOTAL AMOUNT DUE:  {{total_due_formatted}}

    Payment by bank transfer
    Bank:          Public Bank
    Account name:  BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
    Account no.:   3214-1858-04
    Reference:     your unit number (Unit {{unit}})

Please settle at your earliest convenience. If you have already paid, kindly reply to this email with your proof of payment so we can update your account.

Thank you,
The Joint Management Body (JMB)
The Manhattan Residence
```

### 2b. Second reminder – due date + 14 days

| Field in Meta | Value |
|---|---|
| Template name | `tmr_maintenance_reminder_second` |
| Category | **Utility** |
| Language | English (`en`) |
| Used for | app template `reminder_14` |

**Body** (paste exactly):

```
Hello {{1}}, this is a second reminder from the Joint Management Body (JMB) of The Manhattan Residence.

The maintenance charges and sinking fund for Unit {{2}} remain outstanding and are now {{3}} days past the {{4}} due date.

Total amount due: {{5}}

Payment by bank transfer:
Bank: Public Bank
Account name: BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
Account no.: 3214-1858-04
Please use your unit number as the payment reference.

We kindly ask that you settle this amount as soon as possible to keep your account in good standing. If payment has already been made, please reply with your proof of payment. Thank you.
```

**Variable samples** (Meta asks for one example per variable):

| Variable | Filled from sheet | Sample |
|---|---|---|
| `{{1}}` | `name` | Aisyah Rahman |
| `{{2}}` | `unit` | A-12-03 |
| `{{3}}` | `days_overdue` | 14 |
| `{{4}}` | `due_date_formatted` | 15 October 2026 |
| `{{5}}` | `total_due_formatted` | RM 1,565.00 |

**Email version**: subject `Second Reminder – Unit {{unit}} maintenance charges & sinking fund {{days_overdue}} days overdue`

```
Dear {{name}},

This is a second reminder from the Joint Management Body (JMB) of The Manhattan Residence.

The maintenance charges and sinking fund for Unit {{unit}} remain outstanding and are now {{days_overdue}} days past the {{due_date_formatted}} due date.

    TOTAL AMOUNT DUE:  {{total_due_formatted}}

    Payment by bank transfer
    Bank:          Public Bank
    Account name:  BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
    Account no.:   3214-1858-04
    Reference:     your unit number (Unit {{unit}})

We kindly ask that you settle this amount as soon as possible to keep your account in good standing. If payment has already been made, please reply to this email with your proof of payment.

Thank you,
The Joint Management Body (JMB)
The Manhattan Residence
```

### 2c. Final notice – due date + 30 days

| Field in Meta | Value |
|---|---|
| Template name | `tmr_maintenance_final_notice` |
| Category | **Utility** |
| Language | English (`en`) |
| Used for | app template `final_30` |

**Body** (paste exactly):

```
FINAL NOTICE: Hello {{1}}, the maintenance charges and sinking fund for Unit {{2}} at The Manhattan Residence remain outstanding and are now {{3}} days past the {{4}} due date.

Total amount due: {{5}}

Payment by bank transfer:
Bank: Public Bank
Account name: BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
Account no.: 3214-1858-04
Please use your unit number as the payment reference.

Please settle the full amount immediately, or contact the Management Office to discuss your account. Outstanding charges may be subject to late payment interest and further recovery action under the Strata Management Act 2013 (Act 757) and the building's by-laws. If you have already paid, please reply with your proof of payment. Thank you.
```

**Variable samples** (Meta asks for one example per variable):

| Variable | Filled from sheet | Sample |
|---|---|---|
| `{{1}}` | `name` | Aisyah Rahman |
| `{{2}}` | `unit` | A-12-03 |
| `{{3}}` | `days_overdue` | 30 |
| `{{4}}` | `due_date_formatted` | 15 October 2026 |
| `{{5}}` | `total_due_formatted` | RM 1,565.00 |

**Email version**: subject `FINAL NOTICE – Unit {{unit}} maintenance charges & sinking fund {{days_overdue}} days overdue`

```
Dear {{name}},

FINAL NOTICE

The maintenance charges and sinking fund for Unit {{unit}} at The Manhattan Residence remain outstanding and are now {{days_overdue}} days past the {{due_date_formatted}} due date.

    TOTAL AMOUNT DUE:  {{total_due_formatted}}

    Payment by bank transfer
    Bank:          Public Bank
    Account name:  BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
    Account no.:   3214-1858-04
    Reference:     your unit number (Unit {{unit}})

Please settle the full amount immediately, or contact the Management Office to discuss your account. Outstanding charges may be subject to late payment interest and further recovery action under the Strata Management Act 2013 (Act 757) and the building's by-laws.

If you have already paid, please reply to this email with your proof of payment so we can update our records.

The Joint Management Body (JMB)
The Manhattan Residence
```

## 4. Personal Data Protection Notice (use case 3), free text

### Law it follows
- **Personal Data Protection Act 2010 (Act 709)**: the main Act.
- **Personal Data Protection (Amendment) Act 2024 (Act A1727)**: the amendment. (You wrote "Act 1717"; the correct number is **A1727**.) It came into force in phases between 1 January and 1 June 2025.

What this means for the notice:
- **Section 7 (Notice and Choice Principle)** requires the notice to be given in **both Bahasa Melayu and English**. It must cover:
  - what data is processed and its source;
  - the purpose;
  - the classes of third parties it is disclosed to;
  - the person's rights of access and correction, and who to contact;
  - whether giving the data is voluntary, and what happens if they don't.

  The notice below covers each point in both languages.
- **Act A1727** requires a **Data Protection Officer (DPO)**, so the notice names your DPO as the contact. It also adds a right to **data portability**, which the notice mentions. Since the amendment the Act uses "data controller" instead of "data user"; the notice simply says "we".
- **Cross-border transfer**: Meta/WhatsApp may store data outside Malaysia, so the notice says so.

The notice names **Nicco Tan (+60 11-1433 0484)** as the Data Protection Officer in both languages, and identifies the **Joint Management Body (JMB)** as the organisation processing the data. If the DPO changes, edit the notice under Automations. The app refuses to enable any automatic message that still contains a `[placeholder]`.

**Notice** (sent automatically to an unknown sender's first message; about 2,500 characters, within WhatsApp's 4,096 limit):

```
Thank you for messaging The Manhattan Residence Management Office. / Terima kasih kerana menghubungi Pejabat Pengurusan The Manhattan Residence.

PERSONAL DATA PROTECTION NOTICE
The Joint Management Body (JMB) of The Manhattan Residence ("we") processes personal data in accordance with the Personal Data Protection Act 2010 (Act 709), as amended by the Personal Data Protection (Amendment) Act 2024 (Act A1727).
1. Data: your name, mobile number, WhatsApp profile name and the messages you send us, provided by you through this chat.
2. Purpose: to respond to your enquiry, to verify whether you are a resident or unit owner, and to communicate with you about building matters.
3. Disclosure: only authorised management staff, and service providers that run this messaging service (such as Meta/WhatsApp, which may store data outside Malaysia). We do not sell your data or disclose it to other third parties unless required by law.
4. Your rights: you may request access to or correction of your personal data, request data portability where applicable, withdraw your consent, or make an enquiry or complaint by contacting our Data Protection Officer, Nicco Tan, at +60 11-1433 0484.
5. Providing your data is voluntary. If you do not agree, we will not be able to assist you through this channel.

NOTIS PERLINDUNGAN DATA PERIBADI
Badan Pengurusan Bersama (JMB) The Manhattan Residence ("kami") memproses data peribadi menurut Akta Perlindungan Data Peribadi 2010 (Akta 709), sebagaimana dipinda oleh Akta Perlindungan Data Peribadi (Pindaan) 2024 (Akta A1727).
1. Data: nama, nombor telefon bimbit, nama profil WhatsApp dan mesej yang anda hantar kepada kami, yang diberikan oleh anda melalui perbualan ini.
2. Tujuan: untuk menjawab pertanyaan anda, mengesahkan sama ada anda penghuni atau pemilik unit, dan berhubung dengan anda mengenai hal-hal bangunan.
3. Pendedahan: hanya kakitangan pengurusan yang diberi kuasa, dan pembekal perkhidmatan yang mengendalikan perkhidmatan pesanan ini (seperti Meta/WhatsApp, yang mungkin menyimpan data di luar Malaysia). Kami tidak menjual data anda atau mendedahkannya kepada pihak ketiga lain kecuali jika dikehendaki oleh undang-undang.
4. Hak anda: anda boleh meminta akses kepada atau pembetulan data peribadi anda, meminta kemudahalihan data jika berkenaan, menarik balik persetujuan anda, atau membuat pertanyaan atau aduan dengan menghubungi Pegawai Perlindungan Data kami, Nicco Tan, di talian +60 11-1433 0484.
5. Pemberian data anda adalah secara sukarela. Jika anda tidak bersetuju, kami tidak dapat membantu anda melalui saluran ini.

Do you agree? Please reply YES or NO.
Adakah anda bersetuju? Sila balas YA atau TIDAK.
```

| Their answer | Recognised as | Reply |
|---|---|---|
| YES | yes, y, agree, i agree, accept, ya, ye, setuju, saya setuju, ok | Thank you, your consent has been recorded. How may we help you? If you are a resident or unit owner, please send your full name and unit number. / Terima kasih, persetujuan anda telah direkodkan. Bagaimana kami boleh membantu? Jika anda penghuni atau pemilik unit, sila hantar nama penuh dan nombor unit anda. |
| NO | no, n, disagree, decline, i do not agree, i don't agree, tidak, tak, tidak setuju, tak setuju, saya tidak setuju | Thank you. We have recorded that you do not consent, and we will not process your personal data further. For any matter, please visit the Management Office. / Terima kasih. Kami telah merekodkan bahawa anda tidak bersetuju, dan kami tidak akan memproses data peribadi anda selanjutnya. Untuk sebarang urusan, sila hubungi Pejabat Pengurusan secara bersemuka. |
| anything else | e.g. "tidak faham", "apa ni?" | Sorry, we did not understand. Please reply YES if you agree to the notice above, or NO if you do not. / Maaf, kami tidak faham. Sila balas YA jika anda bersetuju dengan notis di atas, atau TIDAK jika anda tidak bersetuju. |

A one-word answer such as *ya* or *tidak* counts only when it stands alone (or with words like "please" or "betul"). That way "tidak faham" (I don't understand) gets the clarification message instead of being recorded as a refusal.

**Not automated:** if someone later asks to **withdraw** consent or to access, correct or delete their data, the request arrives in **Replies** and your DPO handles it manually. Consent records are kept in the app as evidence.

## 5. Balance inquiry replies (use case 4), free text

Trigger words: balance, bill, billing, dues, how much, outstanding, statement, soa, unpaid, owe, baki, bil, yuran, caj, tunggakan, berapa, hutang, penyata, maintenance, sinking fund, service charge, arrears, penyelenggaraan

**Unpaid account:**
```
Hello {{first_name}}, here is the latest statement for Unit {{unit}} of The Manhattan Residence:

Maintenance charges & sinking fund ({{billing_period}}): {{amount_formatted}}
Arrears: {{previous_unpaid_formatted}}
Total amount due: {{total_due_formatted}}
Due date: {{due_date_formatted}} ({{due_status}})

Please settle your balance as soon as possible by bank transfer:
Bank: Public Bank
Account name: BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
Account no.: 3214-1858-04
Reference: Unit {{unit}}

If you have already paid, kindly send us your proof of payment so we can update your account. Thank you!
```
**Paid account:**
```
Hello {{first_name}}, Unit {{unit}} has no outstanding maintenance charges or sinking fund as of today. Thank you for your prompt payment!
```
**Number/email not in the sheet:**
```
We could not find a unit account linked to this number. Please send your full name and unit number, and the Management Office will assist you.
```

Example. Benjamin (Unit B-08-01) writes *"Hi, berapa baki yuran saya?"* and automatically receives:
```
Hello Benjamin, here is the latest statement for Unit B-08-01 of The Manhattan Residence:

Maintenance charges & sinking fund (Q4 2026 (Oct–Dec)): RM 980.00
Arrears: RM 980.00
Total amount due: RM 1,960.00
Due date: 30 September 2026 (overdue by 6 days)

Please settle your balance as soon as possible by bank transfer:
Bank: Public Bank
Account name: BADAN PENGURUSAN BERSAMA THE MANHATTAN RESIDENSI 61 RAJA CHULAN
Account no.: 3214-1858-04
Reference: Unit B-08-01

If you have already paid, kindly send us your proof of payment so we can update your account. Thank you!
```

## 6. Load into the app and switch on

```bash
cd server
npm run seed -- seeds/manhattan-residence.json            # adds the templates and automation texts
npm run seed -- seeds/manhattan-residence.json --force    # overwrite earlier versions (e.g. the first draft)
```

Then in the dashboard:
1. **Contacts & source**: connect the Google Sheet (or upload the file).
2. **Templates**: review the wording. After Meta approves the WhatsApp templates, nothing else is needed, because the template names already match.
3. **Send & schedule**: schedule the quarterly bill notice.
4. **Automations**: tick *Send reminders automatically every day*, *Send the privacy notice*, and *Answer balance questions automatically*. Use **Due for a reminder today** and **Try it** to preview first.

## Before going live, please confirm
- **Legal review**: have Nicco Tan (DPO) or a Malaysian lawyer review the notice. This draft follows the Section 7 requirements, but your actual retention period and service providers should be checked against it.
- **Language of bills and reminders**: these are in English only, which the PDPA doesn't restrict. Bahasa Melayu versions can be added as separate Meta templates if you want them.
- **Final notice**: it says outstanding charges "may be subject to late payment interest and further recovery action under the Strata Management Act 2013 (Act 757) and the building's by-laws". Please confirm with your JMB that this matches how you handle late payers.

Sources: [Act A1727 entry into force (Digital Policy Alert)](https://digitalpolicyalert.org/event/30546-personal-data-protection-amendment-act-2024-act-a1727-including-data-protection-regulation-partially-entered-into-force), [Ministry of Digital commencement order for Act A1727](https://digitalpolicyalert.org/change/14889-ministry-of-digital-order-on-appointment-of-date-of-coming-into-operation-for-personal-data-protection-amendment-act-2024-act-a1727), [Guidelines on PDPA notices (Rajah & Tann)](https://www.rajahtannasia.com/?p=34598), [Act 709 analysis (UNU)](https://c3.unu.edu/projects/ai/policy_analysis/Act_709_14_6_2016_analysis.pdf).
