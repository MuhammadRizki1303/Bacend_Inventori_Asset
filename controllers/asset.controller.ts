import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface Asset extends RowDataPacket {
  id: number;
  name: string;
  type: string;
  category: string;
  status: string;
  value: number;
  assigned_to: number | null;
  location: string;
  purchase_date: string;
  last_maintenance: string | null;
  description: string;
  tags: string[];
}

export const getAllAssets = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, category, status, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT a.*, u.name as assigned_to_name 
      FROM assets a 
      LEFT JOIN users u ON a.assigned_to = u.id 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category) {
      query += ' AND a.category = ?';
      params.push(category);
    }

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (a.name LIKE ? OR a.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const [assets] = await pool.query<Asset[]>(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM assets WHERE 1=1';
    const countParams: any[] = [];

    if (category) {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    if (search) {
      countQuery += ' AND (name LIKE ? OR description LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const [countResult] = await pool.query<RowDataPacket[]>(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      assets,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAssetById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [assets] = await pool.query<Asset[]>(
      `SELECT a.*, u.name as assigned_to_name, 
       creator.name as created_by_name
       FROM assets a 
       LEFT JOIN users u ON a.assigned_to = u.id
       LEFT JOIN users creator ON a.created_by = creator.id
       WHERE a.id = ?`,
      [id]
    );

    if (assets.length === 0) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    res.json(assets[0]);
  } catch (error) {
    console.error('Get asset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createAsset = async (req: Request, res: Response) => {
  try {
    const {
      name,
      type,
      category,
      status = 'active',
      value,
      assigned_to,
      location,
      purchase_date,
      description,
      tags
    } = req.body;

    const userId = (req as any).user.userId;

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO assets 
      (name, type, category, status, value, assigned_to, location, purchase_date, description, tags, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, type, category, status, value, assigned_to, location, purchase_date, description, JSON.stringify(tags || []), userId]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Created new asset', 'asset', result.insertId, JSON.stringify({ name })]
    );

    res.status(201).json({
      message: 'Asset created successfully',
      assetId: result.insertId
    });
  } catch (error) {
    console.error('Create asset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateAsset = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = (req as any).user.userId;

    // Build dynamic update query
    const fields = Object.keys(updates).filter(key => key !== 'id');
    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => {
      if (field === 'tags') {
        return JSON.stringify(updates[field]);
      }
      return updates[field];
    });

    await pool.query(
      `UPDATE assets SET ${setClause} WHERE id = ?`,
      [...values, id]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Updated asset', 'asset', id, JSON.stringify(updates)]
    );

    res.json({ message: 'Asset updated successfully' });
  } catch (error) {
    console.error('Update asset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteAsset = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    // Get asset name before deletion
    const [assets] = await pool.query<Asset[]>(
      'SELECT name FROM assets WHERE id = ?',
      [id]
    );

    if (assets.length === 0) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    await pool.query('DELETE FROM assets WHERE id = ?', [id]);

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Deleted asset', 'asset', id, JSON.stringify({ name: assets[0].name })]
    );

    res.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAssetStats = async (req: Request, res: Response) => {
  try {
    const [stats] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance,
        SUM(value) as total_value,
        COUNT(DISTINCT category) as categories
      FROM assets
    `);

    res.json(stats[0]);
  } catch (error) {
    console.error('Get asset stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};