import { Router } from 'express';
import { 
  sendMessage, 
  getChatHistory, 
  clearChatHistory,
  getSessions 
} from '../controllers/chatbot.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All chatbot routes require authentication
router.use(authenticateToken);

// Send message to chatbot
router.post('/message', sendMessage);

// Get chat history
router.get('/history', getChatHistory);

// Get all sessions
router.get('/sessions', getSessions);

// Clear chat history
router.delete('/history', clearChatHistory);

export default router;