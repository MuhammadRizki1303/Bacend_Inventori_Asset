// auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { RowDataPacket } from 'mysql2';

interface User extends RowDataPacket {
  id: number;
  email: string;
  password: string;
  name: string;
  role: string;
  status: string;
  email_verified: boolean;
}

export const register = async (req: Request, res: Response) => {
  console.log('📝 REGISTER ATTEMPT - START');
  
  try {
    const { name, email, password, phone } = req.body;

    // 1. Validasi cepat
    if (!name || !email || !password) {
      console.log('❌ Validation failed');
      return res.status(400).json({ 
        success: false,
        message: 'Nama, email dan password wajib diisi' 
      });
    }

    console.log('✅ Validation passed:', { name, email });

    // 2. Hash password dengan salt rendah untuk testing
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 8); // Gunakan 8 bukan 10
    console.log('✅ Password hashed');

    // 3. Database query dengan timeout
    const connection = await pool.getConnection();
    console.log('🗄️ Database connected');
    
    try {
      // Cek email exist
      const [existingUsers]: any = await connection.query(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [email]
      );

      if (existingUsers.length > 0) {
        connection.release();
        console.log('❌ Email already exists');
        return res.status(400).json({ 
          success: false,
          message: 'Email sudah terdaftar' 
        });
      }

      // Insert user - VERSI SIMPLE tanpa verification dulu
      console.log('📝 Inserting user...');
      const [result]: any = await connection.query(
        `INSERT INTO users (name, email, password, phone, role, status) 
         VALUES (?, ?, ?, ?, 'User', 'Active')`,
        [name, email, hashedPassword, phone || null]
      );

      connection.release();
      
      console.log('✅ User created, ID:', result.insertId);
      
      // 4. Response cepat tanpa email verification
      res.status(201).json({
        success: true,
        message: 'Registrasi berhasil! Silakan login.',
        userId: result.insertId
      });
      
    } catch (dbError: any) {
      connection.release();
      console.error('❌ Database error:', dbError.message);
      throw dbError;
    }

  } catch (error: any) {
    console.error('🔥 REGISTER ERROR:', error.message);
    
    // Berikan response error yang jelas
    res.status(500).json({ 
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
  
  console.log('📝 REGISTER ATTEMPT - END');
};

export const login = async (req: Request, res: Response) => {
  // ... kode login ...
};

export const logout = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    
    if (userId) {
      // Log activity
      await pool.query(
        'INSERT INTO activity_log (user_id, action, entity_type) VALUES (?, ?, ?)',
        [userId, 'User logged out', 'user']
      );
    }

    res.json({ 
      success: true,
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ 
        success: false,
        message: 'Verification token is required' 
      });
    }

    // Find user with matching token
    const [users]: any = await pool.query(
      `SELECT id, name, email, email_verified, token_expiry 
       FROM users 
       WHERE verification_token = ? AND email_verified = false`,
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or expired verification token' 
      });
    }

    const user = users[0];

    // Check if token is expired
    const tokenExpiry = new Date(user.token_expiry);
    if (tokenExpiry < new Date()) {
      return res.status(400).json({ 
        success: false,
        message: 'Verification token has expired' 
      });
    }

    // Update user as verified
    await pool.query(
      `UPDATE users 
       SET email_verified = true, verification_token = NULL, token_expiry = NULL, status = 'Active'
       WHERE id = ?`,
      [user.id]
    );

    res.json({ 
      success: true,
      message: 'Email verified successfully' 
    });
  } catch (error: any) {
    console.error('Verify email error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

export const verifyEmailGet = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid verification token' 
      });
    }

    // Find user with matching token
    const [users]: any = await pool.query(
      `SELECT id, name, email, email_verified, token_expiry 
       FROM users 
       WHERE verification_token = ? AND email_verified = false`,
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or expired verification token' 
      });
    }

    const user = users[0];

    // Check if token is expired
    const tokenExpiry = new Date(user.token_expiry);
    if (tokenExpiry < new Date()) {
      return res.status(400).json({ 
        success: false,
        message: 'Verification token has expired' 
      });
    }

    // Update user as verified
    await pool.query(
      `UPDATE users 
       SET email_verified = true, verification_token = NULL, token_expiry = NULL, status = 'Active'
       WHERE id = ?`,
      [user.id]
    );

    res.json({ 
      success: true,
      message: 'Email verified successfully' 
    });
  } catch (error: any) {
    console.error('Verify email error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

export const resendVerification = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    // Find user
    const [users]: any = await pool.query(
      'SELECT id, name, email, email_verified FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = users[0];

    if (user.email_verified) {
      return res.status(400).json({ 
        success: false,
        message: 'Email already verified' 
      });
    }

    // Generate new verification token (sederhana)
    const verificationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Update token
    await pool.query(
      'UPDATE users SET verification_token = ?, token_expiry = ? WHERE id = ?',
      [verificationToken, tokenExpiry, user.id]
    );

    res.json({ 
      success: true,
      message: 'Verification email has been resent' 
    });
  } catch (error: any) {
    console.error('Resend verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

export const checkVerificationStatus = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    const [users]: any = await pool.query(
      'SELECT id, email_verified FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = users[0];

    res.json({
      success: true,
      emailVerified: user.email_verified,
      message: user.email_verified ? 'Email is verified' : 'Email not verified'
    });
  } catch (error: any) {
    console.error('Check verification status error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// Export default untuk compatibility
export default {
  register,
  login,
  logout,
  verifyEmail,
  verifyEmailGet,
  resendVerification,
  checkVerificationStatus
};