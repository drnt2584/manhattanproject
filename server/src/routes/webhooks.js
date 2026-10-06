import express, { Router } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { verifyWebhookSignature } from '../providers/whatsapp.js';
import { handleWhatsappWebhook } from '../services/inbound.js';
import { runAutomations } from '../services/automations.js';

const r = Router();

// Meta verification handshake
r.get('/whatsapp', (req, res) => {
  const ok = req.query['hub.mode'] === 'subscribe' && config.whatsapp.verifyToken && req.query['hub.verify_token'] === config.whatsapp.verifyToken;
  if (!ok) return res.sendStatus(403);
  res.type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
});

// Inbound messages and delivery statuses. Raw body is needed for the HMAC check.
r.post('/whatsapp', express.raw({ type: 'application/json', limit: '2mb' }), async (req, res) => {
  if (!verifyWebhookSignature(req.body, req.get('x-hub-signature-256'))) {
    logger.warn({ ip: req.ip }, 'rejected WhatsApp webhook with bad signature');
    return res.sendStatus(401);
  }
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  try {
    const received = await handleWhatsappWebhook(payload);
    res.sendStatus(200);
    // Auto-replies (privacy notice, balance) run after acknowledging so Meta doesn't time out and retry
    if (received.length) runAutomations(received).catch((err) => logger.error({ err }, 'automations failed'));
  } catch (err) {
    logger.error({ err }, 'WhatsApp webhook processing failed');
    res.sendStatus(500); // Meta retries
  }
});

export default r;
