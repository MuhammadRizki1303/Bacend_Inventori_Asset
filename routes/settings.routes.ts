import { Router } from 'express';
import { 
  getSettings, 
  updateProfile, 
  updatePassword, 
  updatePreferences, 
  exportData, 
  resetSettings 
} from '../controllers/settings.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All routes protected
router.use(authenticateToken);

router.get('/', getSettings);
router.put('/profile', updateProfile);
router.put('/password', updatePassword);
router.put('/preferences', updatePreferences);
router.get('/export', exportData);
router.post('/reset', resetSettings);

export default router;
