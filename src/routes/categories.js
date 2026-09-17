import { Router } from 'express';
import { query, queryOne, withTransaction } from '../db/index.js';
import { parseId, sanitizeName } from '../utils/validate.js';

const router = Router();
const UNIQUE_VIOLATION = '23505';

router.get('/', async (req, res) => {
  const categories = await query('SELECT * FROM categories ORDER BY is_default DESC, name ASC');
  res.json(categories);
});

router.post('/', async (req, res) => {
  const name = sanitizeName(req.body?.name);
  const icon = typeof req.body?.icon === 'string' && req.body.icon.trim() ? req.body.icon.trim().slice(0, 8) : '📦';

  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    const category = await queryOne(
      'INSERT INTO categories (name, icon, is_default) VALUES ($1, $2, 0) RETURNING *',
      [name, icon]
    );
    res.status(201).json(category);
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Category not found' });
  const category = await queryOne('SELECT * FROM categories WHERE id = $1', [id]);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  const name = req.body?.name !== undefined ? sanitizeName(req.body.name) : category.name;
  const icon = req.body?.icon !== undefined ? String(req.body.icon).trim().slice(0, 8) : category.icon;

  if (!name) return res.status(400).json({ error: 'Category name cannot be empty' });

  try {
    const updated = await queryOne('UPDATE categories SET name = $1, icon = $2 WHERE id = $3 RETURNING *', [
      name,
      icon,
      id,
    ]);
    res.json(updated);
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Category not found' });
  const category = await queryOne('SELECT * FROM categories WHERE id = $1', [id]);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  const usageCount = (await queryOne('SELECT COUNT(*)::int AS c FROM expenses WHERE category_id = $1', [id])).c;
  const reassignTo = req.query.reassign_to ? parseId(req.query.reassign_to) : null;

  if (usageCount > 0 && req.query.reassign_to && !reassignTo) {
    return res.status(400).json({ error: 'Reassignment target category not found' });
  }

  if (usageCount > 0 && !reassignTo) {
    return res.status(409).json({
      error: 'Category is in use by existing expenses',
      count: usageCount,
      requiresReassign: true,
    });
  }

  try {
    await withTransaction(async (client) => {
      if (usageCount > 0) {
        const { rows } = await client.query('SELECT * FROM categories WHERE id = $1', [reassignTo]);
        const target = rows[0];
        if (!target) throw new Error('REASSIGN_TARGET_NOT_FOUND');
        if (target.id === id) throw new Error('REASSIGN_TARGET_SAME');
        await client.query('UPDATE expenses SET category_id = $1 WHERE category_id = $2', [reassignTo, id]);
      }
      await client.query('DELETE FROM categories WHERE id = $1', [id]);
    });
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
