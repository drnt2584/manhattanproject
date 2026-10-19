'use strict';

function duplicates(items, keyFn) {
  const groups = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  return [...groups.entries()].filter(([, v]) => v.length > 1);
}

/**
 * Data-quality report over the full current dataset (every company JSON on disk),
 * plus duplicate Comp_codes found in the input CSV.
 */
function qualityCheck(records, csvRows, invalidEmails) {
  const codes = (list) => list.map((r) => r.company_code);
  const refPairs = records.flatMap((r) => (r.reference_no || []).map((ref) => ({ ref, code: r.company_code })));

  return {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    total_records_checked: records.length,
    records_missing_address: codes(records.filter((r) => !r.address)),
    records_missing_email: codes(records.filter((r) => !r.email)),
    records_missing_phone: codes(records.filter((r) => !r.phone_no)),
    records_missing_reference_numbers: codes(records.filter((r) => !r.reference_no || r.reference_no.length === 0)),
    duplicate_company_names: duplicates(records, (r) => (r.name ? r.name.toUpperCase() : null))
      .map(([name, rs]) => ({ name: rs[0].name, company_codes: codes(rs) })),
    duplicate_company_codes: {
      in_csv: duplicates(csvRows, (r) => r.company_code).map(([code, rs]) => ({ company_code: code, csv_lines: rs.map((r) => r.line) })),
      in_records: duplicates(records, (r) => r.company_code).map(([code, rs]) => ({ company_code: code, count: rs.length })),
    },
    duplicate_reference_numbers: duplicates(refPairs, (p) => p.ref.toUpperCase())
      .map(([, ps]) => ({ reference_no: ps[0].ref, company_codes: [...new Set(ps.map((p) => p.code))] }))
      .filter((d) => d.company_codes.length > 1),
    companies_with_zero_products: codes(records.filter((r) => !r.product_menu_list || r.product_menu_list.length === 0)),
    invalid_emails: invalidEmails,
  };
}

/** Delta for this run; status counts cover every company successfully processed in this run. */
function deltaReport(counts, runRecords) {
  const status = (s) => runRecords.filter((r) => r.jakim_status === s).length;
  return {
    new_records: counts.new,
    updated_records: counts.updated,
    unchanged_records: counts.unchanged,
    active_companies: status('active'),
    expired_companies: status('expired'),
    unknown_status_companies: status('unknown'),
    new_company_codes: counts.newCodes,
    updated_company_codes: counts.updatedCodes,
  };
}

module.exports = { qualityCheck, deltaReport };
