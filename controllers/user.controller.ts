import { Request, Response } from 'express';
import pool from '../config/database';
import bcrypt from 'bcryptjs';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface User extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  phone: string;
  department: string;
  created_at: string;
  last_login: string;
}

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, role, status, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = 'SELECT id, name, email, phone, role, status, department, created_at, last_login FROM users WHERE 1=1';
    const params: any[] = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const [users] = await pool.query<User[]>(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    const countParams: any[] = [];

    if (role) {
      countQuery += ' AND role = ?';
      countParams.push(role);
    }

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    if (search) {
      countQuery += ' AND (name LIKE ? OR email LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const [countResult] = await pool.query<RowDataPacket[]>(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [users] = await pool.query<User[]>(
      'SELECT id, name, email, phone, role, status, department, created_at, last_login FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(users[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, role = 'User', department } = req.body;
    const userId = (req as any).user.userId;

    // Check if email exists
    const [existingUsers] = await pool.query<User[]>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO users (name, email, password, phone, role, department) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, phone, role, department]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Created new user', 'user', result.insertId, JSON.stringify({ name, email })]
    );

    res.status(201).json({
      message: 'User created successfully',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = (req as any).user.userId;

    // Remove password from updates if present (handle separately)
    delete updates.password;
    delete updates.email; // Don't allow email changes

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);

    await pool.query(
      `UPDATE users SET ${setClause} WHERE id = ?`,
      [...values, id]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Updated user', 'user', id, JSON.stringify(updates)]
    );

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    // Don't allow self-deletion
    if (Number(id) === userId) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const [users] = await pool.query<User[]>(
      'SELECT name FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Deleted user', 'user', id, JSON.stringify({ name: users[0].name })]
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updatePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    const userId = (req as any).user.userId;

    // Only allow users to change their own password or admin to change any password
    const userRole = (req as any).user.role;
    if (Number(id) !== userId && userRole !== 'Admin') {
      return res.status(403).json({ message: 'Not authorized to change this password' });
    }

    // Get current password hash
    const [users] = await pool.query<User[]>(
      'SELECT password FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password (skip for admin)
    if (userRole !== 'Admin') {
      const isValid = await bcrypt.compare(currentPassword, users[0].password);
      if (!isValid) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, id]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)',
      [userId, 'Changed password', 'user', id]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUserStats = async (req: Request, res: Response) => {
  try {
    const [stats] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN role = 'Admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN role = 'Moderator' THEN 1 ELSE 0 END) as moderators,
        SUM(CASE WHEN role = 'User' THEN 1 ELSE 0 END) as regular_users
      FROM users
    `);

    res.json(stats[0]);
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUserActivity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;

    const [activities] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM activity_log 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [id, Number(limit)]
    );

    res.json(activities);
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};