import { Router } from 'express';
import { getSetting, setSetting } from '../db/settings.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    currency_symbol: getSetting('currency_symbol') || '₹',
  });
});

router.put('/', (req, res) => {
  const { currency_symbol } = req.body || {};
  if (typeof currency_symbol !== 'string' || !currency_symbol.trim() || currency_symbol.length > 5) {
    return res.status(400).json({ error: 'Currency symbol must be 1-5 characters' });
  }
  setSetting('currency_symbol', currency_symbol.trim());
  res.json({ currency_symbol: currency_symbol.trim() });
});

export default router;
