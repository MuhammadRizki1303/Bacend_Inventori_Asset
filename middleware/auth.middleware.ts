// middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Debug log
    console.log('🔐 Auth middleware checking...');
    console.log('Headers:', req.headers);
    
    // Ambil token dari Authorization header
    const authHeader = req.headers.authorization;
    console.log('Auth header:', authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No Bearer token found');
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required. Please login.' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    console.log('Token extracted:', token ? 'Yes' : 'No');
    
    if (!token) {
      console.log('❌ Empty token');
      return res.status(401).json({ 
        success: false,
        message: 'Authentication token required' 
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-12345');
    console.log('✅ Token verified:', decoded);
    
    req.user = decoded;
    next();
    
  } catch (error: any) {
    console.error('❌ Token verification error:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired. Please login again.' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token. Please login again.' 
      });
    }
    
    return res.status(401).json({ 
      success: false,
      message: 'Authentication failed' 
    });
  }
};

export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not authenticated' 
      });
    }
    
    const userRole = req.user.role;
    console.log('User role:', userRole, 'Allowed roles:', allowedRoles);
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        success: false,
        message: `Access forbidden. Required roles: ${allowedRoles.join(', ')}` 
      });
    }
    
    next();
  };
};