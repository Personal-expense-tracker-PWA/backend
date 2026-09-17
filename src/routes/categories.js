import { Router } from 'express';
import db from '../db/index.js';
import { sanitizeName } from '../utils/validate.js';

const router = Router();

router.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY is_default DESC, name ASC').all();
  res.json(categories);
});

router.post('/', (req, res) => {
  const name = sanitizeName(req.body?.name);
  const icon = typeof req.body?.icon === 'string' && req.body.icon.trim() ? req.body.icon.trim().slice(0, 8) : '📦';

  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    const info = db
      .prepare('INSERT INTO categories (name, icon, is_default) VALUES (?, ?, 0)')
      .run(name, icon);
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  const name = req.body?.name !== undefined ? sanitizeName(req.body.name) : category.name;
  const icon = req.body?.icon !== undefined ? String(req.body.icon).trim().slice(0, 8) : category.icon;

  if (!name) return res.status(400).json({ error: 'Category name cannot be empty' });

  try {
    db.prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?').run(name, icon, id);
    res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    throw err;
  }
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  const usageCount = db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE category_id = ?').get(id).c;
  const reassignTo = req.query.reassign_to ? Number(req.query.reassign_to) : null;

  if (usageCount > 0 && !reassignTo) {
    return res.status(409).json({
      error: 'Category is in use by existing expenses',
      count: usageCount,
      requiresReassign: true,
    });
  }

  const tx = db.transaction(() => {
    if (usageCount > 0) {
      const target = db.prepare('SELECT * FROM categories WHERE id = ?').get(reassignTo);
      if (!target) throw new Error('REASSIGN_TARGET_NOT_FOUND');
      if (target.id === id) throw new Error('REASSIGN_TARGET_SAME');
      db.prepare('UPDATE expenses SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });

  try {
    tx();
  } catch (err) {
    if (err.message === 'REASSIGN_TARGET_NOT_FOUND') {
      return res.status(400).json({ error: 'Reassignment target category not found' });
    }
    if (err.message === 'REASSIGN_TARGET_SAME') {
      return res.status(400).json({ error: 'Cannot reassign to the category being deleted' });
    }
    throw err;
  }

  res.json({ success: true });
});

export default router;
