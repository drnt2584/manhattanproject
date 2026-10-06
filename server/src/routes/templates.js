import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { audit } from '../services/audit.js';
import { contactVariables, render, templateVariables } from '../lib/template.js';
import { normalizeStatus } from '../lib/normalize.js';
import { HttpError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { actor } from '../auth.js';

const r = Router();

const schema = z.object({
  status_key: z.string().trim().min(1).max(100),
  label: z.string().max(200).default(''),
  wa_enabled: z.boolean().default(true),
  wa_body: z.string().max(4096).default(''),
  wa_template_name: z.string().trim().max(512).regex(/^[a-z0-9_]*$/, 'Meta template names use lowercase letters, numbers and _').nullable().optional(),
  wa_language: z.string().trim().max(15).default('en'),
  wa_params: z.array(z.string().trim().min(1)).max(20).default(['name', 'amount']),
  email_enabled: z.boolean().default(true),
  email_subject: z.string().max(300).default(''),
  email_body: z.string().max(50_000).default(''),
}).superRefine((t, ctx) => {
  if (t.wa_enabled && !t.wa_body.trim() && !t.wa_template_name) ctx.addIssue({ code: 'custom', path: ['wa_body'], message: 'WhatsApp message is empty' });
  if (t.email_enabled && !t.email_subject.trim()) ctx.addIssue({ code: 'custom', path: ['email_subject'], message: 'Email subject is empty' });
  if (t.email_enabled && !t.email_body.trim()) ctx.addIssue({ code: 'custom', path: ['email_body'], message: 'Email body is empty' });
});

const clean = (t) => ({ ...t, status_key: t.status_key === '*' ? '*' : normalizeStatus(t.status_key), wa_template_name: t.wa_template_name || null });

r.get('/', async (_req, res) => {
  const { rows } = await query("SELECT * FROM templates ORDER BY status_key = '*', status_key");
  res.json({ templates: rows });
});

r.post('/', async (req, res) => {
  const t = clean(parse(schema, req.body));
  const { rows: [row] } = await query(
    `INSERT INTO templates (status_key, label, wa_enabled, wa_body, wa_template_name, wa_language, wa_params, email_enabled, email_subject, email_body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [t.status_key, t.label, t.wa_enabled, t.wa_body, t.wa_template_name, t.wa_language, JSON.stringify(t.wa_params), t.email_enabled, t.email_subject, t.email_body],
  ).catch((e) => { throw e.code === '23505' ? new HttpError(409, `A template for status "${t.status_key}" already exists`) : e; });
  await audit({ event: 'template_created', actor: actor(req), details: row });
  res.status(201).json({ template: row });
});

r.put('/:id', async (req, res) => {
  const t = clean(parse(schema, req.body));
  const { rows: [row] } = await query(
    `UPDATE templates SET status_key=$2, label=$3, wa_enabled=$4, wa_body=$5, wa_template_name=$6, wa_language=$7, wa_params=$8,
       email_enabled=$9, email_subject=$10, email_body=$11, updated_at=now() WHERE id=$1 RETURNING *`,
    [Number(req.params.id), t.status_key, t.label, t.wa_enabled, t.wa_body, t.wa_template_name, t.wa_language, JSON.stringify(t.wa_params), t.email_enabled, t.email_subject, t.email_body],
  ).catch((e) => { throw e.code === '23505' ? new HttpError(409, `A template for status "${t.status_key}" already exists`) : e; });
  if (!row) throw new HttpError(404, 'Template not found');
  await audit({ event: 'template_updated', actor: actor(req), details: row });
  res.json({ template: row });
});

r.delete('/:id', async (req, res) => {
  const { rows: [row] } = await query('DELETE FROM templates WHERE id = $1 RETURNING *', [Number(req.params.id)]);
  if (!row) throw new HttpError(404, 'Template not found');
  await audit({ event: 'template_deleted', actor: actor(req), details: row });
  res.json({ ok: true });
});

/** Render a template against a real contact (or sample data) without sending anything. */
r.post('/preview', async (req, res) => {
  const body = parse(z.object({
    wa_body: z.string().default(''), email_subject: z.string().default(''), email_body: z.string().default(''),
    wa_template_name: z.string().nullable().optional(), wa_params: z.array(z.string()).default([]), contact_id: z.number().int().optional(),
  }), req.body);
  let contact;
  if (body.contact_id) {
    contact = (await query('SELECT * FROM contacts WHERE id = $1', [body.contact_id])).rows[0];
    if (!contact) throw new HttpError(404, 'Contact not found');
  } else {
    contact = { name: 'Alex Sample', amount: 1234.5, status: 'sample', email: 'alex@example.com', whatsapp: '15551234567', fields: {} };
  }
  const vars = contactVariables(contact);
  const wa = render(body.wa_body, vars);
  const subject = render(body.email_subject, vars);
  const emailBody = render(body.email_body, vars);
  res.json({
    contact: { name: contact.name, amount: contact.amount, status: contact.status },
    variables: Object.keys(vars).sort(),
    used: [...new Set([...templateVariables(body.wa_body), ...templateVariables(body.email_subject), ...templateVariables(body.email_body)])],
    whatsapp: { text: wa.text, missing: wa.missing, params: body.wa_template_name ? body.wa_params.map((k) => vars[k.toLowerCase()] ?? '') : null },
    email: { subject: subject.text, body: emailBody.text, missing: [...new Set([...subject.missing, ...emailBody.missing])] },
  });
});

export default r;
