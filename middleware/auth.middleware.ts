// auth.middleware.ts - VERSI FIX TYPE ERROR
import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    userId?: number;
    id?: number;
    email: string;
    name?: string;
    role: string;
    exp?: number;
    iat?: number;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    console.log('🔐 === AUTH MIDDLEWARE ===');
    console.log('Method:', req.method);
    console.log('Path:', req.path);
    
    // Ambil token dari Authorization header
    const authHeader = req.headers.authorization;
    console.log('Authorization Header:', authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No Bearer token found');
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required. Please login first.',
        code: 'NO_TOKEN'
      });
    }
    
    const token = authHeader.substring(7); // Remove "Bearer "
    
    if (!token || token.trim().length === 0) {
      console.log('❌ Token is empty');
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token format',
        code: 'EMPTY_TOKEN'
      });
    }
    
    // Verify token
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-12345';
    
    // FIX: Cast decoded ke JwtPayload
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    console.log('✅ Token verified:', {
      userId: decoded.userId || decoded.id,
      email: decoded.email,
      role: decoded.role
    });
    
    // FIX: Assign ke req.user dengan type yang benar
    req.user = {
      userId: decoded.userId || decoded.id,
      id: decoded.userId || decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      exp: decoded.exp,
      iat: decoded.iat
    };
    
    next();
    
  } catch (error: any) {
    console.error('❌ Token verification failed:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token. Please login again.',
        code: 'INVALID_TOKEN'
      });
    }
    
    return res.status(401).json({ 
      success: false,
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

export const authorizeRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not authenticated',
        code: 'NO_USER'
      });
    }

    const userRole = req.user.role;
    
    if (!roles.includes(userRole)) {
      console.log(`❌ Access denied for role: ${userRole}`);
      return res.status(403).json({ 
        success: false,
        message: `Access forbidden. Required role: ${roles.join(' or ')}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
    
    next();
  };
};

// OPTIONAL: Middleware untuk bypass auth di development
export const devAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development' || process.env.DISABLE_AUTH === 'true') {
    req.user = {
      userId: 1,
      id: 1,
      email: 'admin@example.com',
      name: 'Administrator',
      role: 'Admin'
    };
    console.log('⚠️  DEVELOPMENT: Auth bypassed');
    next();
  } else {
    authenticateToken(req, res, next);
  }
};