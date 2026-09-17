import { Router } from 'express';
import { query, queryOne } from '../db/index.js';
import { parseId } from '../utils/validate.js';

const router = Router();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function startOfWeekISO() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = now.getDate() - day;
  const start = new Date(now.setDate(diff));
  return start.toISOString().slice(0, 10);
}

router.get('/dashboard', async (req, res) => {
  const today = todayISO();
  const weekStart = startOfWeekISO();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [todayRow, weekRow, monthRow] = await Promise.all([
    queryOne('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date = $1', [today]),
    queryOne('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= $1 AND date <= $2', [
      weekStart,
      today,
    ]),
    queryOne('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE LEFT(date, 7) = $1', [monthKey]),
  ]);

  res.json({ today: todayRow.total, week: weekRow.total, month: monthRow.total });
});

router.get('/monthly', async (req, res) => {
  const { month, year, category_id, payment_method, search } = req.query;
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  const monthKey = `${y}-${String(m).padStart(2, '0')}`;

  const clauses = ['LEFT(e.date, 7) = $1'];
  const params = [monthKey];
  const param = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (category_id) {
    clauses.push(`e.category_id = ${param(parseId(category_id))}`);
  }
  if (payment_method) {
    clauses.push(`e.payment_method = ${param(payment_method)}`);
  }
  if (search) {
    clauses.push(`e.note ILIKE ${param(`%${search}%`)}`);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;

  const [totalRow, byCategory, dailyTrend] = await Promise.all([
    queryOne(`SELECT COALESCE(SUM(e.amount), 0) AS total FROM expenses e ${where}`, params),
    query(
      `SELECT c.id AS category_id, c.name, c.icon, COALESCE(SUM(e.amount), 0) AS total
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       ${where}
       GROUP BY c.id
       ORDER BY total DESC`,
      params
    ),
    query(
      `SELECT e.date, COALESCE(SUM(e.amount), 0) AS total
       FROM expenses e
       ${where}
       GROUP BY e.date
       ORDER BY e.date ASC`,
      params
    ),
  ]);

  res.json({ month: m, year: y, total: totalRow.total, byCategory, dailyTrend });
});

export default router;
