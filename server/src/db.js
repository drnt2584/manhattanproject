import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

// NUMERIC -> JS number (amounts here are well within double precision)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// BIGINT -> JS number for ids/counts
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => logger.error({ err }, 'postgres pool error'));

export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
