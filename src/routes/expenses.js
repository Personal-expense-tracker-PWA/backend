import { Router } from 'express';
import db from '../db/index.js';
import {
  isValidDate,
  isValidAmount,
  isValidPaymentMethod,
  sanitizeNote,
} from '../utils/validate.js';

const router = Router();

const EXPENSE_SELECT = `
  SELECT e.*, c.name AS category_name, c.icon AS category_icon
  FROM expenses e
  JOIN categories c ON c.id = e.category_id
`;

router.get('/', (req, res) => {
  const { start, end, category_id, payment_method, search, month, year } = req.query;

  const clauses = [];
  const params = {};

  if (month && year) {
    const m = String(Number(month)).padStart(2, '0');
    clauses.push("strftime('%Y-%m', e.date) = @ym");
    params.ym = `${year}-${m}`;
  } else {
    if (start && isValidDate(start)) {
      clauses.push('e.date >= @start');
      params.start = start;
    }
    if (end && isValidDate(end)) {
      clauses.push('e.date <= @end');
      params.end = end;
    }
  }

  if (category_id) {
    clauses.push('e.category_id = @category_id');
    params.category_id = Number(category_id);
  }

  if (payment_method) {
    clauses.push('e.payment_method = @payment_method');
    params.payment_method = payment_method;
  }

  if (search) {
    clauses.push('e.note LIKE @search');
    params.search = `%${search}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`${EXPENSE_SELECT} ${where} ORDER BY e.date DESC, e.id DESC`)
    .all(params);

  res.json(rows);
});

router.post('/', (req, res) => {
  const { date, amount, category_id, payment_method, note } = req.body || {};

  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
  if (!isValidAmount(amount)) return res.status(400).json({ error: 'Amount must be a positive number' });
  if (!isValidPaymentMethod(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(Number(category_id));
  if (!category) return res.status(400).json({ error: 'Invalid category' });

  const roundedAmount = Math.round(amount * 100) / 100;
  const cleanNote = sanitizeNote(note);

  const info = db
    .prepare(
      `INSERT INTO expenses (date, amount, category_id, payment_method, note)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(date, roundedAmount, category.id, payment_method, cleanNote);

  const row = db.prepare(`${EXPENSE_SELECT} WHERE e.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });

  const date = req.body?.date !== undefined ? req.body.date : existing.date;
  const amount = req.body?.amount !== undefined ? req.body.amount : existing.amount;
  const categoryId = req.body?.category_id !== undefined ? Number(req.body.category_id) : existing.category_id;
  const paymentMethod = req.body?.payment_method !== undefined ? req.body.payment_method : existing.payment_method;
  const note = req.body?.note !== undefined ? sanitizeNote(req.body.note) : existing.note;

  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
  if (!isValidAmount(amount)) return res.status(400).json({ error: 'Amount must be a positive number' });
  if (!isValidPaymentMethod(paymentMethod)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
  if (!category) return res.status(400).json({ error: 'Invalid category' });

  const roundedAmount = Math.round(amount * 100) / 100;

  db.prepare(
    `UPDATE expenses
     SET date = ?, amount = ?, category_id = ?, payment_method = ?, note = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(date, roundedAmount, category.id, paymentMethod, note, id);

  const row = db.prepare(`${EXPENSE_SELECT} WHERE e.id = ?`).get(id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM expenses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });

  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
