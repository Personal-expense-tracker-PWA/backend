import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getSetting, setSetting } from '../db/settings.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();
const PIN_RE = /^\d{4,6}$/;

router.get('/status', (req, res) => {
  const pinHash = getSetting('pin_hash');
  res.json({ pinSet: Boolean(pinHash) });
});

router.post('/set-pin', (req, res) => {
  const existing = getSetting('pin_hash');
  if (existing) {
    return res.status(409).json({ error: 'PIN already set. Use change-pin instead.' });
  }

  const { pin } = req.body || {};
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) {
    return res.status(400).json({ error: 'PIN must be 4-6 digits' });
  }

  const hash = bcrypt.hashSync(pin, 10);
  setSetting('pin_hash', hash);

  const token = signToken(true);
  res.status(201).json({ token });
});

router.post('/verify-pin', (req, res) => {
  const hash = getSetting('pin_hash');
  if (!hash) {
    return res.status(400).json({ error: 'No PIN has been set yet' });
  }

  const { pin, remember } = req.body || {};
  if (typeof pin !== 'string') {
    return res.status(400).json({ error: 'PIN is required' });
  }

  if (!bcrypt.compareSync(pin, hash)) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }

  const token = signToken(Boolean(remember));
  res.json({ token });
});

router.post('/change-pin', requireAuth, (req, res) => {
  const hash = getSetting('pin_hash');
  const { oldPin, newPin } = req.body || {};

  if (!hash || typeof oldPin !== 'string' || !bcrypt.compareSync(oldPin, hash)) {
    return res.status(401).json({ error: 'Current PIN is incorrect' });
  }

  if (typeof newPin !== 'string' || !PIN_RE.test(newPin)) {
    return res.status(400).json({ error: 'New PIN must be 4-6 digits' });
  }

  setSetting('pin_hash', bcrypt.hashSync(newPin, 10));
  res.json({ success: true });
});

export default router;
