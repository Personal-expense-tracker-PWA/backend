import { query, queryOne } from './index.js';

export async function getSetting(key) {
  const row = await queryOne('SELECT value FROM settings WHERE key = $1', [key]);
  return row ? row.value : undefined;
}

export async function setSetting(key, value) {
  await query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, value]
  );
}
