import { Router } from 'express';
import { 
  register, 
  login, 
  logout, 
  verifyEmail, 
  verifyEmailGet, 
  resendVerification, 
  checkVerificationStatus 
} from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// 🆕 TEST ROUTE - HARUS DITAMBAHKAN
router.get('/test', (req, res) => {
  console.log('✅ /api/auth/test route called');
  res.json({ 
    message: 'Auth routes are working!',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'POST /register',
      'POST /login',
      'POST /verify-email', 
      'GET /verify-email',
      'POST /resend-verification',
      'POST /check-verification',
      'POST /logout'
    ]
  });
});

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.get('/verify-email', verifyEmailGet);
router.post('/resend-verification', resendVerification);
router.post('/check-verification', checkVerificationStatus);

// Protected routes
router.post('/logout', authenticateToken, logout);

export default router;