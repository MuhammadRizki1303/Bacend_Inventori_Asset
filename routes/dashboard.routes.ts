import { Router } from 'express';
import { getDashboardStats, getActivityLog, getChartData } from '../controllers/dashboard.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/stats', getDashboardStats);
router.get('/activity', getActivityLog);
router.get('/charts', getChartData);

export default router;