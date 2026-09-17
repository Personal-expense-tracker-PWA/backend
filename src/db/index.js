import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || './data/expenses.db';
const resolvedPath = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(process.cwd(), DB_PATH);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT '📦',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
  CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const defaultCategories = [
  ['Food', '🍔'],
  ['Transport', '🚌'],
  ['Bills', '🧾'],
  ['Shopping', '🛍️'],
  ['Health', '💊'],
  ['Entertainment', '🎬'],
  ['Other', '📦'],
];

const insertCategory = db.prepare(
  'INSERT OR IGNORE INTO categories (name, icon, is_default) VALUES (?, ?, 1)'
);
const seedCategories = db.transaction((cats) => {
  for (const [name, icon] of cats) insertCategory.run(name, icon);
});
seedCategories(defaultCategories);

const defaultSettings = {
  currency_symbol: '₹',
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
const seedSettings = db.transaction((entries) => {
  for (const [key, value] of entries) insertSetting.run(key, value);
});
seedSettings(Object.entries(defaultSettings));

export default db;
