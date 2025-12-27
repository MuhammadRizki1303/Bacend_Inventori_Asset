// auth.middleware.ts - PERBAIKAN
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    console.log('Auth middleware checking token...');
    
    // Cari token di beberapa tempat
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];
    const tokenFromQuery = req.query.token as string;
    
    const token = tokenFromHeader || tokenFromQuery;
    
    console.log('Token found:', token ? 'Yes' : 'No');

    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({ 
        success: false,
        message: 'Access token required' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-12345');
    req.user = decoded;
    
    console.log('✅ Token verified for user:', req.user.email);
    next();
    
  } catch (error: any) {
    console.error('❌ Token verification failed:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired' 
      });
    }
    
    return res.status(403).json({ 
      success: false,
      message: 'Invalid token' 
    });
  }
};

export const authorizeRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not authenticated' 
      });
    }

    const userRole = req.user.role;
    
    if (!roles.includes(userRole)) {
      console.log(`❌ Insufficient permissions. User role: ${userRole}, Required: ${roles}`);
      return res.status(403).json({ 
        success: false,
        message: 'Insufficient permissions' 
      });
    }
    
    next();
  };
};