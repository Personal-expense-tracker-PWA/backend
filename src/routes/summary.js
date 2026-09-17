import { Router } from 'express';
import db from '../db/index.js';

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

router.get('/dashboard', (req, res) => {
  const today = todayISO();
  const weekStart = startOfWeekISO();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const todayTotal = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date = ?')
    .get(today).total;

  const weekTotal = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= ? AND date <= ?')
    .get(weekStart, today).total;

  const monthTotal = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE strftime('%Y-%m', date) = ?")
    .get(monthKey).total;

  res.json({ today: todayTotal, week: weekTotal, month: monthTotal });
});

router.get('/monthly', (req, res) => {
  const { month, year, category_id, payment_method, search } = req.query;
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  const monthKey = `${y}-${String(m).padStart(2, '0')}`;

  const clauses = ["strftime('%Y-%m', e.date) = @monthKey"];
  const params = { monthKey };

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

  const where = `WHERE ${clauses.join(' AND ')}`;

  const total = db
    .prepare(`SELECT COALESCE(SUM(e.amount), 0) AS total FROM expenses e ${where}`)
    .get(params).total;

  const byCategory = db
    .prepare(
      `SELECT c.id AS category_id, c.name, c.icon, COALESCE(SUM(e.amount), 0) AS total
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       ${where}
       GROUP BY c.id
       ORDER BY total DESC`
    )
    .all(params);

  const dailyTrend = db
    .prepare(
      `SELECT e.date, COALESCE(SUM(e.amount), 0) AS total
       FROM expenses e
       ${where}
       GROUP BY e.date
       ORDER BY e.date ASC`
    )
    .all(params);

  res.json({ month: m, year: y, total, byCategory, dailyTrend });
});

export default router;
