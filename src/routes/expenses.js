import { Router } from 'express';
import { query, queryOne, NOW_TEXT } from '../db/index.js';
import {
  isValidDate,
  isValidAmount,
  isValidPaymentMethod,
  parseId,
  sanitizeNote,
} from '../utils/validate.js';

const router = Router();

const EXPENSE_SELECT = `
  SELECT e.*, c.name AS category_name, c.icon AS category_icon
  FROM expenses e
  JOIN categories c ON c.id = e.category_id
`;

router.get('/', async (req, res) => {
  const { start, end, category_id, payment_method, search, month, year } = req.query;

  const clauses = [];
  const params = [];
  const param = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (month && year) {
    const m = String(Number(month)).padStart(2, '0');
    clauses.push(`LEFT(e.date, 7) = ${param(`${year}-${m}`)}`);
  } else {
    if (start && isValidDate(start)) {
      clauses.push(`e.date >= ${param(start)}`);
    }
    if (end && isValidDate(end)) {
      clauses.push(`e.date <= ${param(end)}`);
    }
  }

  if (category_id) {
    clauses.push(`e.category_id = ${param(parseId(category_id))}`);
  }

  if (payment_method) {
    clauses.push(`e.payment_method = ${param(payment_method)}`);
  }

  if (search) {
    clauses.push(`e.note ILIKE ${param(`%${search}%`)}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await query(`${EXPENSE_SELECT} ${where} ORDER BY e.date DESC, e.id DESC`, params);

  res.json(rows);
});

router.post('/', async (req, res) => {
  const { date, amount, category_id, payment_method, note } = req.body || {};

  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
  if (!isValidAmount(amount)) return res.status(400).json({ error: 'Amount must be a positive number' });
  if (!isValidPaymentMethod(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  const categoryId = parseId(category_id);
  const category = categoryId && (await queryOne('SELECT id FROM categories WHERE id = $1', [categoryId]));
  if (!category) return res.status(400).json({ error: 'Invalid category' });

  const roundedAmount = Math.round(amount * 100) / 100;
  const cleanNote = sanitizeNote(note);

  const inserted = await queryOne(
    `INSERT INTO expenses (date, amount, category_id, payment_method, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [date, roundedAmount, category.id, payment_method, cleanNote]
  );

  const row = await queryOne(`${EXPENSE_SELECT} WHERE e.id = $1`, [inserted.id]);
  res.status(201).json(row);
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const existing = id && (await queryOne('SELECT * FROM expenses WHERE id = $1', [id]));
  if (!existing) return res.status(404).json({ error: 'Expense not found' });

  const date = req.body?.date !== undefined ? req.body.date : existing.date;
  const amount = req.body?.amount !== undefined ? req.body.amount : existing.amount;
  const categoryId = req.body?.category_id !== undefined ? parseId(req.body.category_id) : existing.category_id;
  const paymentMethod = req.body?.payment_method !== undefined ? req.body.payment_method : existing.payment_method;
  const note = req.body?.note !== undefined ? sanitizeNote(req.body.note) : existing.note;

  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
  if (!isValidAmount(amount)) return res.status(400).json({ error: 'Amount must be a positive number' });
  if (!isValidPaymentMethod(paymentMethod)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  const category = categoryId && (await queryOne('SELECT id FROM categories WHERE id = $1', [categoryId]));
  if (!category) return res.status(400).json({ error: 'Invalid category' });

  const roundedAmount = Math.round(amount * 100) / 100;

  await query(
    `UPDATE expenses
     SET date = $1, amount = $2, category_id = $3, payment_method = $4, note = $5, updated_at = ${NOW_TEXT}
     WHERE id = $6`,
    [date, roundedAmount, category.id, paymentMethod, note, id]
  );

  const row = await queryOne(`${EXPENSE_SELECT} WHERE e.id = $1`, [id]);
  res.json(row);
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = id && (await queryOne('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]));
  if (!deleted) return res.status(404).json({ error: 'Expense not found' });

  res.json({ success: true });
});

export default router;
