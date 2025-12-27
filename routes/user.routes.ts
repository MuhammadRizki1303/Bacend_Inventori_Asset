import { Router } from 'express';
import { getAllUsers, getUserById, createUser, updateUser, deleteUser } from '../controllers/user.controller';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getAllUsers);
router.get('/:id', getUserById);
router.post('/', authorizeRole('Admin', 'Moderator'), createUser);
router.put('/:id', authorizeRole('Admin', 'Moderator'), updateUser);
router.delete('/:id', authorizeRole('Admin'), deleteUser);

export default router;