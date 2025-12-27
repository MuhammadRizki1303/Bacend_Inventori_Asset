import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database'; // Asumsi mysql2 pool
import { RowDataPacket } from 'mysql2';
import { createObjectCsvWriter } from 'csv-writer'; // Untuk export CSV
import fs from 'fs';
import path from 'path';

interface UserSettingsRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  preferences?: string; // JSON string dari DB
  role: string;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Get user settings (profile + preferences)
export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId; // Dari auth middleware

    const [rows]: [UserSettingsRow[], any[]] = await pool.query<UserSettingsRow[]>(
      'SELECT id, name, email, phone, department, preferences FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, message: 'User  not found' } as ApiResponse);
      return;
    }

    const user = rows[0];
    const preferences = user.preferences ? JSON.parse(user.preferences) : {
      notifications: { email: true, push: false, sms: true },
      system: { autoBackup: true, analytics: true }
    };

    const responseData = {
      profile: {
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        department: user.department || ''
      },
      notifications: preferences.notifications,
      system: preferences.system
    };

    res.json({ success: true, data: responseData } as ApiResponse<typeof responseData>);
  } catch (error: any) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message } as ApiResponse);
  }
};

// Update profile
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { name, phone, department } = req.body;

    if (!name) {
      res.status(400).json({ success: false, message: 'Name is required' } as ApiResponse);
      return;
    }

    await pool.query(
      'UPDATE users SET name = ?, phone = ?, department = ? WHERE id = ?',
      [name, phone || null, department || null, userId]
    );

    res.json({ success: true, message: 'Profile updated successfully' } as ApiResponse);
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message } as ApiResponse);
  }
};

// Update password
export const updatePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      res.status(400).json({ success: false, message: 'All password fields are required' } as ApiResponse);
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ success: false, message: 'New passwords do not match' } as ApiResponse);
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, message: 'New password must be at least 8 characters' } as ApiResponse);
      return;
    }

    // Get current hashed password
    const [rows]: [UserSettingsRow[], any[]] = await pool.query<UserSettingsRow[]>(
      'SELECT password FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, message: 'User  not found' } as ApiResponse);
      return;
    }

    const isValid = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isValid) {
      res.status(400).json({ success: false, message: 'Current password is incorrect' } as ApiResponse);
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

    res.json({ success: true, message: 'Password updated successfully' } as ApiResponse);
  } catch (error: any) {
    console.error('Update password error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message } as ApiResponse);
  }
};

// Update preferences (notifications & system)
export const updatePreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { notifications, system } = req.body;

    const preferences = {
      notifications: notifications || { email: true, push: false, sms: true },
      system: system || { autoBackup: true, analytics: true }
    };

    await pool.query(
      'UPDATE users SET preferences = ? WHERE id = ?',
      [JSON.stringify(preferences), userId]
    );

    res.json({ success: true, message: 'Preferences updated successfully' } as ApiResponse);
  } catch (error: any) {
    console.error('Update preferences error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message } as ApiResponse);
  }
};

// Export user data (CSV)
export const exportData = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const [rows]: [any[], any[]] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, message: 'User  not found' } as ApiResponse);
      return;
    }

    const userData = rows[0];
    const csvPath = path.join(__dirname, `../exports/user_${userId}_data_${Date.now()}.csv`);

    // Buat dir jika belum ada
    const exportsDir = path.dirname(csvPath);
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'name', title: 'Name' },
        { id: 'email', title: 'Email' },
        { id: 'phone', title: 'Phone' },
        { id: 'department', title: 'Department' },
        { id: 'role', title: 'Role' },
        { id: 'created_at', title: 'Created At' },
        // Tambah field lain sesuai schema
      ],
      append: false
    });

    await csvWriter.writeRecords([userData]);

    res.download(csvPath, `user_data_${userId}.csv`, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Hapus file setelah download
      fs.unlinkSync(csvPath);
    });
  } catch (error: any) {
    console.error('Export data error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message } as ApiResponse);
  }
};

// Reset settings to default
export const resetSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const defaultPreferences = {
      notifications: { email: true, push: false, sms: true },
      system: { autoBackup: true, analytics: true }
    };

    await pool.query(
      'UPDATE users SET preferences = ? WHERE id = ?',
      [JSON.stringify(defaultPreferences), userId]
    );

    res.json({ success: true, message: 'Settings reset to default' } as ApiResponse);
  } catch (error: any) {
    console.error('Reset settings error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message } as ApiResponse);
  }
};
