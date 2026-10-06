import pino from 'pino';
import { config } from './config.js';

const targets = [{ target: 'pino/file', options: { destination: 1 }, level: config.logLevel }];
if (config.logFile) targets.push({ target: 'pino/file', options: { destination: config.logFile, mkdir: true }, level: config.logLevel });

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'password', '*.password', '*.accessToken', '*.smtpPass'],
    censor: '[redacted]',
  },
  transport: { targets },
});
