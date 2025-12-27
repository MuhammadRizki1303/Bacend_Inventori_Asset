import { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pool from '../config/database';
import { RowDataPacket } from 'mysql2';

interface ChatMessage extends RowDataPacket {
  id: number;
  user_id: number;
  session_id: string;
  message: string;
  response: string;
  created_at: Date;
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// System prompt untuk membatasi topik pembicaraan
const SYSTEM_PROMPT = `
ANDA ADALAH ASISTEN AI KHUSUS UNTUK WEBSITE MANAJEMEN ASET DAN PERPUSTAKAN DIGITAL.

FUNGSI DAN FITUR UTAMA WEBSITE INI:
1. Manajemen Pengguna (People Management) - mengelola user, roles, permissions
2. Manajemen Aset (Asset Management) - upload, organisasi, dan tracking aset digital
3. Perpustakaan Digital (Library) - penyimpanan dan manajemen dokumen, gambar, video, audio
4. Dashboard Analytics - statistik penggunaan, grafik, dan reporting
5. Sistem Autentikasi - login, register, manajemen session

ATURAN KETAT:
- HANYA jawab pertanyaan yang berkaitan dengan website ini dan fitur-fiturnya
- JANGAN jawab pertanyaan tentang topik lain seperti politik, agama, hiburan, berita, atau topik umum lainnya
- JIKA ditanya di luar topik website, SOPAN menolak dan arahkan kembali ke fitur website
- FOKUS pada bantuan penggunaan fitur, troubleshooting, dan panduan website

CONTOH PERTANYAAN YANG BOLEH DIJAWAB:
- "Bagaimana cara upload file?"
- "Apa saja role user yang tersedia?"
- "Bagaimana melihat statistik di dashboard?"
- "Cara mengelola pengguna?"
- "Fitur apa saja yang ada di library?"

CONTOH PERTANYAAN YANG TIDAK BOLEH DIJAWAB:
- "Siapa presiden Indonesia?"
- "Bagaimana cara memasak nasi goreng?"
- "Berita terbaru hari ini apa?"
- "Rekomendasi film terbaru"

RESPON PENOLAKAN YANG SOPAN:
"Maaf, saya hanya dapat membantu dengan pertanyaan seputar website manajemen aset dan perpustakaan digital. Apakah ada yang bisa saya bantu terkait fitur-fitur website kami?"

Tujuan Anda adalah membantu pengguna memahami dan menggunakan website dengan efektif.
`;

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;
    const userId = (req as any).user.userId;

    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Validate API Key
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ message: 'Gemini API key not configured' });
    }

    // Get chat history for context (last 10 messages)
    const [chatHistory] = await pool.query<ChatMessage[]>(
      `SELECT message, response FROM chat_history 
       WHERE user_id = ? AND session_id = ? 
       ORDER BY created_at DESC LIMIT 10`,
      [userId, sessionId || 'default']
    );

    // Initialize Gemini model
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-001',
      systemInstruction: SYSTEM_PROMPT
    });

    // Build conversation context dengan prompt system
    const conversationHistory = [
      {
        role: 'user',
        parts: [{ text: SYSTEM_PROMPT }],
      },
      {
        role: 'model',
        parts: [{ text: 'Baik, saya mengerti. Saya akan fokus membantu pengguna dengan pertanyaan seputar website manajemen aset dan perpustakaan digital saja.' }],
      },
      ...chatHistory.reverse().map(chat => [
        {
          role: 'user',
          parts: [{ text: chat.message }],
        },
        {
          role: 'model', 
          parts: [{ text: chat.response }],
        }
      ]).flat()
    ];

    // Start chat with history
    const chat = model.startChat({
      history: conversationHistory,
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.3, // Lower temperature untuk respons lebih konsisten
      },
    });

    // Send message and get response
    const result = await chat.sendMessage(message);
    const response = result.response.text();

    // Save to database
    await pool.query(
      `INSERT INTO chat_history (user_id, session_id, message, response) 
       VALUES (?, ?, ?, ?)`,
      [userId, sessionId || 'default', message, response]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type) VALUES (?, ?, ?)',
      [userId, 'Chat message sent', 'chat']
    );

    res.json({
      success: true,
      message: message,
      response: response,
      sessionId: sessionId || 'default',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Chat error:', error);
    
    // Fallback response untuk error
    const fallbackResponse = "Maaf, saat ini saya mengalami gangguan teknis. Silakan hubungi administrator atau coba lagi nanti.";
    
    res.status(500).json({ 
      message: 'Failed to process message',
      error: error instanceof Error ? error.message : 'Unknown error',
      response: fallbackResponse
    });
  }
};

// ... (fungsi lainnya tetap sama)
export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { sessionId, limit = 50 } = req.query;

    const query = sessionId 
      ? 'SELECT * FROM chat_history WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?';
    
    const params = sessionId 
      ? [userId, sessionId, parseInt(limit as string)]
      : [userId, parseInt(limit as string)];

    const [chatHistory] = await pool.query<ChatMessage[]>(query, params);

    res.json({
      success: true,
      count: chatHistory.length,
      history: chatHistory.reverse()
    });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ message: 'Failed to retrieve chat history' });
  }
};

export const clearChatHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { sessionId } = req.body;

    if (sessionId) {
      await pool.query(
        'DELETE FROM chat_history WHERE user_id = ? AND session_id = ?',
        [userId, sessionId]
      );
    } else {
      await pool.query(
        'DELETE FROM chat_history WHERE user_id = ?',
        [userId]
      );
    }

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type) VALUES (?, ?, ?)',
      [userId, 'Chat history cleared', 'chat']
    );

    res.json({
      success: true,
      message: 'Chat history cleared successfully'
    });
  } catch (error) {
    console.error('Clear chat history error:', error);
    res.status(500).json({ message: 'Failed to clear chat history' });
  }
};

export const getSessions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const [sessions] = await pool.query<RowDataPacket[]>(
      `SELECT 
        session_id,
        COUNT(*) as message_count,
        MAX(created_at) as last_activity,
        MIN(created_at) as first_activity
       FROM chat_history 
       WHERE user_id = ? 
       GROUP BY session_id 
       ORDER BY last_activity DESC`,
      [userId]
    );

    res.json({
      success: true,
      sessions: sessions
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ message: 'Failed to retrieve sessions' });
  }
};