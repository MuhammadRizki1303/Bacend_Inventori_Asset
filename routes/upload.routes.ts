import { Router } from 'express';
import { uploadAssetFiles, upload } from '../controllers/upload.controller';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.post(
  '/assets', 
  authorizeRole('Admin', 'Moderator', 'User'),
  upload.array('files', 10), 
  uploadAssetFiles
);

export default router;