import { Router } from 'express';
import { query, withTransaction, NOW_TEXT } from '../db/index.js';
import { isValidDate, isValidAmount, isValidPaymentMethod, sanitizeNote, sanitizeName } from '../utils/validate.js';

const router = Router();

function toCsvValue(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

router.get('/export/csv', async (req, res) => {
  const { start, end } = req.query;
  const clauses = [];
  const params = [];

  if (start && isValidDate(start)) {
    params.push(start);
    clauses.push(`e.date >= $${params.length}`);
  }
  if (end && isValidDate(end)) {
    params.push(end);
    clauses.push(`e.date <= $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = await query(
    `SELECT e.date, e.amount, c.name AS category, e.payment_method, e.note
     FROM expenses e JOIN categories c ON c.id = e.category_id
     ${where}
     ORDER BY e.date ASC, e.id ASC`,
    params
  );

  const header = ['Date', 'Amount', 'Category', 'Payment Method', 'Note'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.date, r.amount, r.category, r.payment_method, r.note].map(toCsvValue).join(','));
  }

  const csv = lines.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="expenses-${Date.now()}.csv"`);
  res.send(csv);
});

router.get('/export/json', async (req, res) => {
  const [expenses, categories, settings] = await Promise.all([
    query('SELECT * FROM expenses ORDER BY id ASC'),
    query('SELECT * FROM categories ORDER BY id ASC'),
    query('SELECT key, value FROM settings'),
  ]);

  res.json({
    exportedAt: new Date().toISOString(),
    version: 1,
    expenses,
    categories,
    settings: settings.filter((s) => s.key !== 'pin_hash'),
  });
});

router.post('/import/json', async (req, res) => {
  const { expenses, categories } = req.body || {};

  if (!Array.isArray(expenses) || !Array.isArray(categories)) {
    return res.status(400).json({ error: 'Invalid backup file format' });
  }

  for (const c of categories) {
    if (!c || typeof c.name !== 'string' || !c.name.trim()) {
      return res.status(400).json({ error: 'Invalid category entry in backup file' });
    }
  }
  for (const e of expenses) {
    if (!e || !isValidDate(e.date) || !isValidAmount(Number(e.amount)) || !isValidPaymentMethod(e.payment_method)) {
      return res.status(400).json({ error: 'Invalid expense entry in backup file' });
    }
  }

  try {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM expenses');
      await client.query('DELETE FROM categories');

      const catIdMap = new Map();
      for (const c of categories) {
        const { rows } = await client.query(
          'INSERT INTO categories (name, icon, is_default) VALUES ($1, $2, $3) RETURNING id',
          [sanitizeName(c.name) || 'Other', c.icon || '📦', c.is_default ? 1 : 0]
        );
        if (c.id !== undefined) catIdMap.set(c.id, rows[0].id);
      }

      for (const e of expenses) {
        const mappedCategoryId = catIdMap.get(e.category_id) || [...catIdMap.values()][0];
        await client.query(
          `INSERT INTO expenses (date, amount, category_id, payment_method, note, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6, ${NOW_TEXT}), COALESCE($7, ${NOW_TEXT}))`,
          [
            e.date,
            Math.round(Number(e.amount) * 100) / 100,
            mappedCategoryId,
            e.payment_method,
            sanitizeNote(e.note),
            e.created_at || null,
            e.updated_at || null,
          ]
        );
      }
    });
  } catch (err) {
    return res.status(400).json({ error: 'Failed to import backup: ' + err.message });
  }

  res.json({ success: true, imported: { expenses: expenses.length, categories: categories.length } });
});

export default router;
