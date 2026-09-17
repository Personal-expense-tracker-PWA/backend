import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Refusing to start without it.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX) || 5,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error', err);
});

export const NOW_TEXT = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`;

export async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0];
}

// Runs fn(client) inside BEGIN/COMMIT, rolling back if it throws.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT '📦',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT},
      updated_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
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

  const defaultSettings = {
    currency_symbol: '₹',
  };

  await withTransaction(async (client) => {
    for (const [name, icon] of defaultCategories) {
      await client.query(
        'INSERT INTO categories (name, icon, is_default) VALUES ($1, $2, 1) ON CONFLICT (name) DO NOTHING',
        [name, icon]
      );
    }
    for (const [key, value] of Object.entries(defaultSettings)) {
      await client.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [
        key,
        value,
      ]);
    }
  });
}

export default pool;
