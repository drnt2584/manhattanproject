'use strict';

const { chromium } = require('playwright');

const NAV_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 3;

/**
 * Runs inside the browser. Returns the raw structure of the page so that all
 * parsing happens in Node (and can be unit-tested without a browser):
 *   tables: every <table> as rows of cell innerText (direct rows/cells only)
 *   text:   document innerText (fallback for non-table layouts)
 */
function snapshotPage() {
  const tables = Array.from(document.querySelectorAll('table')).map((t) =>
    Array.from(t.rows).map((r) => Array.from(r.cells).map((c) => c.innerText || ''))
  );
  return { tables, text: document.body ? document.body.innerText : '' };
}

function classifyError(err) {
  const msg = String((err && err.message) || err);
  if (/timeout/i.test(msg)) return 'timeout';
  if (/ERR_NAME_NOT_RESOLVED/i.test(msg)) return 'dns_resolution_failed';
  if (/ERR_CONNECTION|ECONNRESET|ERR_TUNNEL|ERR_PROXY/i.test(msg)) return 'connection_failed';
  if (/^http_\d+/.test(msg)) return msg;
  return msg.split('\n')[0].slice(0, 300);
}

async function launchBrowser() {
  return chromium.launch({ headless: true });
}

/** Opens one URL with retries; returns { ok, snapshot, attempts } or { ok:false, reason, attempts }. */
async function scrapeUrl(context, url, log) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const page = await context.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
      if (resp && resp.status() >= 400) throw new Error(`http_${resp.status()}`);
      await page.waitForLoadState('load', { timeout: NAV_TIMEOUT_MS });
      const snapshot = await page.evaluate(snapshotPage);
      return { ok: true, snapshot, attempts: attempt };
    } catch (err) {
      lastErr = err;
      log(`  attempt ${attempt}/${MAX_ATTEMPTS} failed for ${url}: ${classifyError(err)}`);
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    } finally {
      await page.close().catch(() => {});
    }
  }
  return { ok: false, reason: classifyError(lastErr), attempts: MAX_ATTEMPTS };
}

module.exports = { launchBrowser, scrapeUrl, snapshotPage, NAV_TIMEOUT_MS, MAX_ATTEMPTS };
