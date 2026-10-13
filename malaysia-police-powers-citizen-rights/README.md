# Malaysian Police Powers & Citizen Rights Database

Compliance-grade, source-driven dataset mapping Malaysian primary legislation to
police powers, citizen rights, legal thresholds, verification procedures,
evidence preservation and escalation routes across 69 scenarios in 10 categories.

**This is a legal knowledge-engineering artefact, not legal advice.** Every row
cites the statutory text actually reviewed, classifies the authority relied on,
and flags where the position is unsettled or where a source was not available.

## Deliverables (`data/`)

| File | Contents |
|---|---|
| `police_powers_citizen_rights.csv` | 69 scenario rows x 35 columns (the main dataset) |
| `police_powers_citizen_rights.xlsx` | Same data plus all companion tables as sheets |
| `research_gaps.csv` | 22 issues with Clearly_Authorized / Clearly_Prohibited / Needs_Case_Law_Review / Comments |
| `top20_rights.csv` | Top 20 rights ranked by practical importance, with sources |
| `top20_police_powers.csv` | Top 20 most frequently encountered powers, ranked, with thresholds and limits |
| `sources_register.csv` | Every source consulted, the exact version reviewed, and what was NOT supplied |
| `data_dictionary.csv` | Definition and format of every column |

Rebuild with `python3 scripts/build_dataset.py` (requires `openpyxl`). Scenario
content lives in `scripts/rows/*.py`; companion tables in
`scripts/companion_tables.py`.

## Scenario coverage

| Category | Scenarios | Rows |
|---|---|---|
| A Street interactions | 1-6 | 6 |
| B Arrests | 7-17 | 11 |
| C Detention | 18-23 | 6 |
| D Remand | 24-28 | 5 |
| E Body searches | 29-36 | 8 |
| F Property searches | 37-43 | 7 |
| G Digital searches | 44-55 | 12 |
| H Vehicles | 56-60 | 5 |
| I Drug investigations | 61-64 | 4 |
| J Foreign nationals | 65-69 | 5 |

Confidence distribution: HIGH 42, MEDIUM 16, LOW 11.

## Method

1. **Statute first.** Each row's `Exact_Citation` quotes the uploaded text of the
   Act (version recorded in `sources_register.csv`). Section numbers were
   checked against the supplied documents, not recalled from memory.
2. **Red Book as secondary guidance.** The Malaysian Bar Red Book (May 2023) is
   mapped in `Red_Book_Topic` and cited as "Bar Council Guidance". Where it
   conflicts with statute the statute wins and the conflict is recorded
   (notably strip searches: the Red Book's "no law compels one to strip" predates
   the CPC Fourth Schedule, which now authorises strip searches of arrested
   persons under conditions).
3. **Explicit uncertainty.** Rows use the labels *Requires Case Law Review*,
   *Requires Independent Verification* and *Legal Position Not Explicitly Stated
   In Statute Reviewed*. Nothing is asserted as law that the reviewed text does
   not support.
4. **Phone Search Framework.** Every Category G row answers five questions in
   `Research_Notes`: seizure, inspection, password compulsion, biometric unlock,
   cloud access.
5. **Warrant validation.** Every warrant-dependent row carries a validity
   checklist and invalidity indicators derived from CPC ss.54-59.

## Known source gaps (read before relying on affected rows)

- **Communications and Multimedia Act 1998 (Act 588) was not supplied.** The
  file labelled "MCMC" is Act 589 (the Commission Act) and its 2026 amendment,
  neither of which contains search, seizure or interception powers. CMA
  references in Category G are marked for independent verification.
- **Lock-up Rules 1953, Immigration Act 1959/63, National Registration
  Regulations 1990, IPCC Act 2022, Vienna Convention Art 36** were not supplied.
  Welfare, immigration, identity-card and consular rows are rated LOW/MEDIUM
  accordingly.
- **SOSMA** text reviewed is the 2015 reprint plus the 2024 amendment (which
  deletes s.19 only). The 2024 amendment's commencement date needs confirmation.
- The **Police (Amendment) Regulations 2025** supplied concern fees for extra
  police services and do not affect any row.

## Intended uses

RegTech rule bases, compliance checklists, legal RAG ingestion (one scenario per
row; `|` separates list items inside a cell; no embedded newlines), citizen
decision-support flows, and internal legal research. Re-verify against current
law before any operational deployment.
