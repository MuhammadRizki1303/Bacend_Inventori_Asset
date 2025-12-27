import { Router } from 'express';
import { 
  getAllAssets, 
  getAssetById, 
  createAsset, 
  updateAsset, 
  deleteAsset,
  getAssetStats 
} from '../controllers/asset.controller';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getAllAssets);
router.get('/stats', getAssetStats);
router.get('/:id', getAssetById);
router.post('/', authorizeRole('Admin', 'Moderator'), createAsset);
router.put('/:id', authorizeRole('Admin', 'Moderator'), updateAsset);
router.delete('/:id', authorizeRole('Admin'), deleteAsset);

export default router;