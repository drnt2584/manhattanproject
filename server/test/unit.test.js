import './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, normalizeEmail, parseAmount, normalizeHeader } from '../src/lib/normalize.js';
import { render, contactVariables } from '../src/lib/template.js';
import { rowsToContacts, parseCsvBuffer } from '../src/services/spreadsheet.js';
import { parseSheetUrl } from '../src/services/googleSheets.js';
import { canonicalJson } from '../src/lib/canonical.js';
import { stripQuoted } from '../src/services/imap.js';
import { csvCell } from '../src/lib/validate.js';

test('normalizePhone', () => {
  assert.equal(normalizePhone('0917 123 4567', '63'), '639171234567');
  assert.equal(normalizePhone('+63 917-123-4567', '63'), '639171234567');
  assert.equal(normalizePhone('639171234567', '63'), '639171234567');
  assert.equal(normalizePhone('9171234567', '63'), '639171234567');
  assert.equal(normalizePhone('0044 20 7946 0958', '63'), '442079460958');
  assert.equal(normalizePhone('6.39171234567e+11', '63'), '639171234567');
  assert.equal(normalizePhone('12345', '63'), null);
  assert.equal(normalizePhone('', '63'), null);
});

test('normalizeEmail / parseAmount / normalizeHeader', () => {
  assert.equal(normalizeEmail(' Ana@Example.COM '), 'ana@example.com');
  assert.equal(normalizeEmail('not an email'), null);
  assert.equal(parseAmount('PHP 1,234.50'), 1234.5);
  assert.equal(parseAmount('1.234,50'), 1234.5);
  assert.equal(parseAmount('1,234'), 1234);
  assert.equal(parseAmount(42), 42);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('(500)'), -500);
  assert.equal(normalizeHeader(' WhatsApp Number '), 'whatsapp_number');
});

test('render reports missing variables instead of sending blanks', () => {
  const vars = contactVariables({ name: 'Ana Cruz', amount: 1500, fields: { due_date: '2026-10-30' } });
  assert.deepEqual(render('Hi {{ name }}, pay {{amount}} by {{due_date}}', vars), { text: 'Hi Ana Cruz, pay 1500 by 2026-10-30', missing: [] });
  assert.equal(render('Hi {{first_name}}', vars).text, 'Hi Ana');
  assert.deepEqual(render('Ref {{invoice}}', vars).missing, ['invoice']);
});

test('rowsToContacts maps aliases, normalizes and warns', () => {
  const rows = parseCsvBuffer(Buffer.from('﻿Full Name,Phone,E-mail,Status Type,Amount Due\nAna,0917 111 2222,ANA@x.com,Overdue,"1,000"\nBen,,bad-email,Paid,abc\n,,,,\n'));
  const { contacts, mapping } = rowsToContacts(rows);
  assert.equal(mapping.name, 'full_name');
  assert.equal(mapping.whatsapp, 'phone');
  assert.equal(contacts.length, 2);
  assert.deepEqual([contacts[0].whatsapp, contacts[0].email, contacts[0].status, contacts[0].amount], ['639171112222', 'ana@x.com', 'overdue', 1000]);
  assert.equal(contacts[0].row_number, 2);
  assert.ok(contacts[1].warnings.some((w) => w.includes('invalid email')));
  assert.ok(contacts[1].warnings.includes('amount is not a number'));
  assert.throws(() => rowsToContacts(parseCsvBuffer(Buffer.from('foo,bar\n1,2\n'))), /Missing required column/);
});

test('semicolon CSV is detected', () => {
  const rows = parseCsvBuffer(Buffer.from('name;email;status;amount\nAna;a@x.com;new;5\n'));
  assert.equal(rows[0].email, 'a@x.com');
});

test('parseSheetUrl', () => {
  assert.deepEqual(parseSheetUrl('https://docs.google.com/spreadsheets/d/1AbC-xyz_9/edit#gid=12345'), { sheetId: '1AbC-xyz_9', gid: '12345' });
  assert.deepEqual(parseSheetUrl('https://docs.google.com/spreadsheets/d/abc/edit?usp=sharing'), { sheetId: 'abc', gid: '0' });
  assert.throws(() => parseSheetUrl('https://evil.com/spreadsheets/d/abc'), /docs.google.com/);
});

test('canonicalJson sorts keys deeply', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}');
});

test('stripQuoted keeps only the reply', () => {
  assert.equal(stripQuoted('Thanks, paid today.\n\nOn Mon, 5 Oct 2026 at 10:00, Co <a@b.c> wrote:\n> Hi Ana'), 'Thanks, paid today.');
});

test('csvCell neutralizes formulas', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('a,b'), '"a,b"');
});
