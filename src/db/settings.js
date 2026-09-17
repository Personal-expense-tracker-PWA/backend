import db from './index.js';

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

export function getSetting(key) {
  const row = getStmt.get(key);
  return row ? row.value : undefined;
}

export function setSetting(key, value) {
  setStmt.run(key, value);
}
