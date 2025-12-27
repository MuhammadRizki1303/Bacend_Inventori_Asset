import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

interface LibraryItem extends RowDataPacket {
  id: number;
  title: string;
  type: string;
  file_size: number;
  file_path: string;
  uploaded_by: number;
  description: string;
  tags: string[];
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/library';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|mp3|wav/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

export const getAllLibraryItems = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, type, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT l.*, u.name as uploaded_by_name 
      FROM library_items l 
      JOIN users u ON l.uploaded_by = u.id 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (type) {
      query += ' AND l.type = ?';
      params.push(type);
    }

    if (search) {
      query += ' AND (l.title LIKE ? OR l.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const [items] = await pool.query<LibraryItem[]>(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM library_items WHERE 1=1';
    const countParams: any[] = [];

    if (type) {
      countQuery += ' AND type = ?';
      countParams.push(type);
    }

    if (search) {
      countQuery += ' AND (title LIKE ? OR description LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const [countResult] = await pool.query<RowDataPacket[]>(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get library items error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getLibraryItemById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [items] = await pool.query<LibraryItem[]>(
      `SELECT l.*, u.name as uploaded_by_name 
       FROM library_items l 
       JOIN users u ON l.uploaded_by = u.id 
       WHERE l.id = ?`,
      [id]
    );

    if (items.length === 0) {
      return res.status(404).json({ message: 'Library item not found' });
    }

    // Increment view count
    await pool.query(
      'UPDATE library_items SET views = views + 1 WHERE id = ?',
      [id]
    );

    res.json(items[0]);
  } catch (error) {
    console.error('Get library item error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createLibraryItem = async (req: Request, res: Response) => {
  try {
    const { title, description, tags, type } = req.body;
    const userId = (req as any).user.userId;
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO library_items 
      (title, type, file_size, file_path, mime_type, uploaded_by, description, tags) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, type, file.size, file.path, file.mimetype, userId, description, JSON.stringify(tags || [])]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Uploaded library item', 'library', result.insertId, JSON.stringify({ title })]
    );

    res.status(201).json({
      message: 'Library item created successfully',
      itemId: result.insertId
    });
  } catch (error) {
    console.error('Create library item error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateLibraryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, tags } = req.body;
    const userId = (req as any).user.userId;

    const updates: any = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (tags) updates.tags = JSON.stringify(tags);

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);

    await pool.query(
      `UPDATE library_items SET ${setClause} WHERE id = ?`,
      [...values, id]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Updated library item', 'library', id, JSON.stringify({ title })]
    );

    res.json({ message: 'Library item updated successfully' });
  } catch (error) {
    console.error('Update library item error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteLibraryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    // Get file path
    const [items] = await pool.query<LibraryItem[]>(
      'SELECT file_path, title FROM library_items WHERE id = ?',
      [id]
    );

    if (items.length === 0) {
      return res.status(404).json({ message: 'Library item not found' });
    }

    // Delete file
    if (fs.existsSync(items[0].file_path)) {
      fs.unlinkSync(items[0].file_path);
    }

    await pool.query('DELETE FROM library_items WHERE id = ?', [id]);

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Deleted library item', 'library', id, JSON.stringify({ title: items[0].title })]
    );

    res.json({ message: 'Library item deleted successfully' });
  } catch (error) {
    console.error('Delete library item error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const downloadLibraryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [items] = await pool.query<LibraryItem[]>(
      'SELECT file_path, title FROM library_items WHERE id = ?',
      [id]
    );

    if (items.length === 0) {
      return res.status(404).json({ message: 'Library item not found' });
    }

    const filePath = items[0].file_path;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    // Increment download count
    await pool.query(
      'UPDATE library_items SET downloads = downloads + 1 WHERE id = ?',
      [id]
    );

    res.download(filePath, items[0].title);
  } catch (error) {
    console.error('Download library item error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getLibraryStats = async (req: Request, res: Response) => {
  try {
    const [stats] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN type = 'document' THEN 1 ELSE 0 END) as documents,
        SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as images,
        SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as videos,
        SUM(CASE WHEN type = 'audio' THEN 1 ELSE 0 END) as audio,
        SUM(file_size) as total_size,
        SUM(downloads) as total_downloads
      FROM library_items
    `);

    res.json(stats[0]);
  } catch (error) {
    console.error('Get library stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};