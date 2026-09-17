import { Router } from 'express';
import { getSetting, setSetting } from '../db/settings.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json({
    currency_symbol: (await getSetting('currency_symbol')) || '₹',
  });
});

router.put('/', async (req, res) => {
  const { currency_symbol } = req.body || {};
  if (typeof currency_symbol !== 'string' || !currency_symbol.trim() || currency_symbol.length > 5) {
    return res.status(400).json({ error: 'Currency symbol must be 1-5 characters' });
  }
  await setSetting('currency_symbol', currency_symbol.trim());
  res.json({ currency_symbol: currency_symbol.trim() });
});

export default router;
