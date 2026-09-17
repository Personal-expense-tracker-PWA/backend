import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import expenseRoutes from './routes/expenses.js';
import categoryRoutes from './routes/categories.js';
import summaryRoutes from './routes/summary.js';
import settingsRoutes from './routes/settings.js';
import dataRoutes from './routes/data.js';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Refusing to start without it.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/expenses', requireAuth, expenseRoutes);
app.use('/api/categories', requireAuth, categoryRoutes);
app.use('/api/summary', requireAuth, summaryRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api', requireAuth, dataRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Expense tracker API listening on port ${PORT}`);
});
