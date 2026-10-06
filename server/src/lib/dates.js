import { config } from '../config.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');

function iso(y, m, d) {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Parse a spreadsheet date into 'YYYY-MM-DD'. Accepts ISO dates, 10/30/2026
 * (or 30/10/2026 with DATE_FORMAT=DMY), "Oct 30, 2026", "30 October 2026"
 * and Excel serial numbers.
 */
export function parseDate(raw, format = config.dateFormat) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    // An impossible month settles the ambiguity, otherwise use DATE_FORMAT
    if (a > 12) return iso(y, b, a);
    if (b > 12) return iso(y, a, b);
    return format === 'DMY' ? iso(y, b, a) : iso(y, a, b);
  }
  if ((m = s.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i))) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return mi >= 0 ? iso(+m[3], mi + 1, +m[2]) : null;
  }
  if ((m = s.match(/^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/i))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mi >= 0 ? iso(+m[3], mi + 1, +m[1]) : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Today's date ('YYYY-MM-DD') in the app's time zone. */
export function todayIso(now = new Date(), timeZone = config.timezone) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Current 'HH:MM' in the app's time zone. */
export function nowHm(now = new Date(), timeZone = config.timezone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'). */
export function daysBetween(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

export function formatDateLong(isoDate) {
  if (!isoDate) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(isoDate + 'T00:00:00Z'));
}
