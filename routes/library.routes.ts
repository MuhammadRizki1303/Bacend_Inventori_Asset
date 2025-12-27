// routes/library.ts
import { Router } from 'express';
import { 
  getAllLibraryItems, 
  getLibraryItemById, // Changed from getLibraryItem
  createLibraryItem, 
  updateLibraryItem,
  deleteLibraryItem,
  downloadLibraryItem,
  getLibraryStats,
  upload 
} from '../controllers/library.controller';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getAllLibraryItems);
router.get('/stats', getLibraryStats);
router.get('/:id', getLibraryItemById); // Changed from getLibraryItem
router.get('/:id/download', downloadLibraryItem);
router.post('/', upload.single('file'), createLibraryItem);
router.put('/:id', updateLibraryItem);
router.delete('/:id', authorizeRole('Admin', 'Moderator'), deleteLibraryItem);

export default router;