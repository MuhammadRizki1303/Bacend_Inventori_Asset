import { Router } from 'express';
import { 
  getAllBorrowings, 
  getDeviceStocks, 
  createBorrowing, 
  returnBorrowing,
  createDevice,
  updateDeviceStock,
  deleteDevice,
  getBorrowingStats
} from '../controllers/borrowing.controller';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

// Borrowing routes
router.get('/', getAllBorrowings);
router.get('/stats', getBorrowingStats);
router.post('/', createBorrowing);
router.patch('/:id/return', returnBorrowing);

// Device stock routes
router.get('/devices', getDeviceStocks);
router.post('/devices', authorizeRole('Admin', 'Moderator'), createDevice);
router.put('/devices/:id/stock', authorizeRole('Admin', 'Moderator'), updateDeviceStock);
router.delete('/devices/:id', authorizeRole('Admin'), deleteDevice);

export default router;