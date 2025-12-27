// auth.controller.ts - PERBAIKAN
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';

export const register = async (req: Request, res: Response) => {
  try {
    console.log('Register request body:', req.body);
    
    const { name, email, password, phone, department } = req.body;

    // Validasi sederhana
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Name, email, and password are required' 
      });
    }

    const conn = await pool.getConnection();
    
    try {
      // Cek jika email sudah terdaftar
      const [existingUsers]: any = await conn.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (existingUsers.length > 0) {
        return res.status(400).json({ 
          success: false,
          message: 'Email already registered' 
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user (tanpa verification untuk testing)
      const [result]: any = await conn.query(
        `INSERT INTO users (name, email, password, phone, department, role, email_verified) 
         VALUES (?, ?, ?, ?, ?, 'User', TRUE)`,
        [name, email, hashedPassword, phone || null, department || null]
      );

      const userId = result.insertId;

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: userId, 
          email: email, 
          name: name, 
          role: 'User' 
        },
        process.env.JWT_SECRET || 'fallback-secret-key-12345',
        { expiresIn: '24h' }
      );

      console.log('✅ User registered:', { userId, email });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          id: userId,
          name,
          email,
          role: 'User'
        },
        token
      });

    } finally {
      conn.release();
    }

  } catch (error: any) {
    console.error('❌ Register error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error registering user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    console.log('Login request:', req.body);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    const conn = await pool.getConnection();
    
    try {
      // Cari user
      const [users]: any = await conn.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );

      if (users.length === 0) {
        return res.status(401).json({ 
          success: false,
          message: 'Invalid credentials' 
        });
      }

      const user = users[0];

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ 
          success: false,
          message: 'Invalid credentials' 
        });
      }

      // Generate JWT
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          name: user.name, 
          role: user.role 
        },
        process.env.JWT_SECRET || 'fallback-secret-key-12345',
        { expiresIn: '24h' }
      );

      // Update last login
      await conn.query(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [user.id]
      );

      // Hapus password dari response
      delete user.password;

      res.json({
        success: true,
        message: 'Login successful',
        data: user,
        token
      });

    } finally {
      conn.release();
    }

  } catch (error: any) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error logging in',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};