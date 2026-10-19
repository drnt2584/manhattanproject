# Halalify JAKIM Ingestion Pipeline

Scrapes JAKIM Halal Directory company pages listed in a CSV (`Comp_code,URL`),
normalizes the data, computes ACTIVE/EXPIRED status, detects changes by SHA256 hash,
keeps version history, and exports JSON / JSONL / reports / ZIP.

## Run locally (macOS, incl. Mac mini M4 Pro)

```bash
# 1. Node.js 18+ (skip if `node -v` already prints v18 or newer)
brew install node

# 2. Install dependencies + Chromium for Playwright (one time)
cd halalify-ingest
npm run setup

# 3. Run against the full CSV (8,083 URLs)
npm start
# equivalent to:
node src/index.js --csv input/Compcode.csv --out output
```

Options:

| Flag | Default | Purpose |
|---|---|---|
| `--csv` | `input/Compcode.csv` | Input CSV (header row skipped; col A = Comp_code, col B = URL) |
| `--out` | `output` | Output directory |
| `--concurrency` | `5` | Pages scraped in parallel |
| `--offset` / `--limit` | `0` / all | Process a slice, e.g. a 20-row trial: `--limit 20` |

Try a small batch first: `node src/index.js --limit 20`, then open
`output/json/` and confirm the fields look right before running everything.

At 5 pages in parallel, a full run takes about 1–2 hours depending on how fast the
JAKIM site responds. You can stop it with **Ctrl+C**: pages already in progress
finish, and reports and the ZIP are still written. Re-running is safe: companies
already saved are skipped as `unchanged` unless their page changed.

Run tests: `npm test` (serves local HTML fixtures; no internet needed).

## Output

```
output/
  json/{company_code}_{company_name}.json   current version per company
  history/{company_code}/{YYYY-MM-DD}.json  previous versions (on change)
  companies_master.jsonl                    append-only: new + updated records only
  extraction_summary.json
  delta_report.json
  quality_check.json
  processing_errors.json
  debug/{company_code}.json                 raw page structure for pages that failed validation
  companies_json.zip                        json/ + jsonl + the four reports
```

## Rules implemented

- **company_code** always comes from the CSV, never from the page. Duplicate codes in
  the CSV are processed once and listed in `quality_check.json`.
- **Navigation**: headless Chromium, `waitUntil: networkidle`, 60 s timeout, 3 attempts
  with backoff. A failing URL is logged to `processing_errors.json`; the job continues.
- **Dates**: `15/03/2028` → `2028-03-15` (also `dd-mm-yyyy`, `dd.mm.yyyy`, `15 Mar 2028`).
  Unparseable or impossible dates (e.g. `31/02/2027`) keep their original text.
- **jakim_status**: `active` if any valid expiry ≥ today (UTC), `expired` if all are
  before today, `unknown` if there are no valid expiry dates.
- **Brands**: a brand cell with several lines becomes an array (deduplicated).
- **Deduplication**: officers, references, brands; products by product + brand + expiry.
- **Empty strings → null**; `website` empty → `null`; invalid email → `null` and listed
  under `invalid_emails` in `quality_check.json`.
- **page_hash** = SHA256 over the normalized record with sorted keys, excluding
  `scraped_at`, `page_hash`, `change_status` and `jakim_status`. `jakim_status`
  depends on today's date, so including it would mark a page "updated" when only the
  calendar changed. The expiry dates it is calculated from are part of the hash.
- **Incremental**: no existing file → `new`; same hash → `unchanged` (file not
  touched, not appended to JSONL); different hash → `updated` (old file moved to
  `history/`, new file written, appended to JSONL).
- **Validation**: a record needs company_code, source_url, name and a product_menu_list
  (an empty list is allowed but flagged under `companies_with_zero_products`).

## If the extraction looks wrong

The parser was written against the documented JAKIM layout (label / value rows, then a
`No | Product | Brand | Expiry Date` table), but it has not yet been run against the
live site. If records fail with `invalid record: missing name`, send over one file
from `output/debug/`. It contains the page's tables exactly as the browser saw them,
and the label patterns in `src/extract.js` (`LABELS`, `HEADER_COLS`) can be adjusted
to match.

## Code layout

| File | Responsibility |
|---|---|
| `src/index.js` | CLI, worker pool, run orchestration, reports |
| `src/csv.js` | CSV parsing (BOM, quotes, CRLF) |
| `src/scrape.js` | Playwright navigation, retries, page snapshot |
| `src/extract.js` | Company fields + product table from the snapshot |
| `src/normalize.js` | Cleaning, dates, status, hash, filenames, validation |
| `src/store.js` | Incremental upsert, history, JSONL |
| `src/reports.js` | Quality check and delta report |
| `src/zip.js` | ZIP packaging |
