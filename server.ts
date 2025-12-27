import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';

// 🔥 IMPORT DATABASE INIT - SESUAIKAN PATH
import { initDatabase, testConnection } from './config/database';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import assetRoutes from './routes/asset.routes';
import libraryRoutes from './routes/library.routes';
import dashboardRoutes from './routes/dashboard.routes';
import chatbotRoutes from './routes/chatbot.routes';
import uploadRoutes from './routes/upload.routes';
import settingsRoutes from './routes/settings.routes';
import borrowingRoutes from './routes/borrowing.routes';
import migrationRoutes from './routes/migration.routes';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;

// 🔥 ASYNC FUNCTION UNTUK MULAI SERVER
const startServer = async () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 SERVER INITIALIZATION STARTED');
  console.log('='.repeat(50));

  try {
    // ==================== STEP 1: DATABASE CONNECTION ====================
    console.log('\n📦 STEP 1: DATABASE CONNECTION');
    console.log('─'.repeat(40));
    
    console.log('🔗 Testing database connection...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ Database connection FAILED!');
      console.log('⚠️  Server will start but database operations may fail.');
      console.log('💡 Check:');
      console.log('   • Database credentials in .env');
      console.log('   • Network connectivity to Railway');
      console.log('   • Database server status');
    } else {
      console.log('✅ Database connection SUCCESSFUL');
    }

    // ==================== STEP 2: DATABASE INITIALIZATION ====================
    console.log('\n📦 STEP 2: DATABASE INITIALIZATION');
    console.log('─'.repeat(40));
    
    console.log('🔄 Initializing database tables...');
    await initDatabase();
    console.log('✅ Database initialization COMPLETE');

    // ==================== STEP 3: EXPRESS MIDDLEWARE SETUP ====================
    console.log('\n📦 STEP 3: EXPRESS MIDDLEWARE');
    console.log('─'.repeat(40));
    
    // Security middleware
    app.use(helmet());
    
    // CORS configuration
    const corsOptions = {
      origin: process.env.FRONTEND_URL || 'https://assetinventory.my.id',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
    };
    app.use(cors(corsOptions));
    console.log('✅ CORS configured for:', corsOptions.origin);
    
    // Body parsing
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    console.log('✅ Body parser configured (50MB limit)');

    // ==================== STEP 4: REQUEST LOGGING MIDDLEWARE ====================
    app.use((req: Request, res: Response, next: NextFunction) => {
      const timestamp = new Date().toISOString();
      console.log(`\n [${timestamp}]`);
      console.log(`   Method: ${req.method}`);
      console.log(`   Path: ${req.originalUrl}`);
      console.log(`   IP: ${req.ip}`);
      
      if (req.headers.authorization) {
        const authHeader = req.headers.authorization;
        const tokenPreview = authHeader.length > 25 ? 
          authHeader.substring(0, 25) + '...' : authHeader;
        console.log(`   Auth: ${tokenPreview}`);
      }
      
      if (req.method === 'POST' || req.method === 'PUT') {
        const bodyCopy = { ...req.body };
        if (bodyCopy.password) bodyCopy.password = '[HIDDEN]';
        console.log(`   Body: ${JSON.stringify(bodyCopy, null, 2)}`);
      }
      
      next();
    });
    console.log('✅ Request logging middleware enabled');

    // ==================== STEP 5: API ROUTES REGISTRATION ====================
    console.log('\n📦 STEP 4: ROUTE REGISTRATION');
    console.log('─'.repeat(40));
    
    // Migration routes
    app.use('/api/migration', (req, res, next) => {
      console.log(`📊 Migration route: ${req.method} ${req.path}`);
      next();
    }, migrationRoutes);
    console.log('✅ Migration routes registered');

    // Health check endpoint
    app.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        geminiConfigured: !!process.env.GEMINI_API_KEY,
        database: dbConnected ? 'Connected' : 'Disconnected',
        routes: {
          auth: '/api/auth/*',
          users: '/api/users/*',
          assets: '/api/assets/*',
          library: '/api/library/*',
          dashboard: '/api/dashboard/*',
          chatbot: '/api/chatbot/*',
          upload: '/api/upload/*',
          migration: '/api/migration/*'
        }
      });
    });
    console.log('✅ Health check endpoint: GET /health');

    // Auth routes
    app.use('/api/auth', (req, res, next) => {
      console.log(`🔐 AUTH ROUTE: ${req.method} ${req.path}`);
      next();
    }, authRoutes);
    console.log('✅ Auth routes registered');

    // User routes
    app.use('/api/users', (req, res, next) => {
      console.log(`👤 Users route: ${req.method} ${req.path}`);
      next();
    }, userRoutes);
    console.log('✅ User routes registered');

    // Asset routes
    app.use('/api/assets', (req, res, next) => {
      console.log(`🏷️  Assets route: ${req.method} ${req.path}`);
      next();
    }, assetRoutes);
    console.log('✅ Asset routes registered');

    // Library routes
    app.use('/api/library', (req, res, next) => {
      console.log(`📚 Library route: ${req.method} ${req.path}`);
      next();
    }, libraryRoutes);
    console.log('✅ Library routes registered');

    // Dashboard routes
    app.use('/api/dashboard', (req, res, next) => {
      console.log(`📊 Dashboard route: ${req.method} ${req.path}`);
      next();
    }, dashboardRoutes);
    console.log('✅ Dashboard routes registered');

    // Settings routes
    app.use('/api/settings', (req, res, next) => {
      console.log(`⚙️  Settings route: ${req.method} ${req.path}`);
      next();
    }, settingsRoutes);
    console.log('✅ Settings routes registered');

    // Borrowing routes
    app.use('/api/borrowings', (req, res, next) => {
      console.log(`📋 Borrowings route: ${req.method} ${req.path}`);
      next();
    }, borrowingRoutes);
    console.log('✅ Borrowing routes registered');

    // Chatbot routes
    app.use('/api/chatbot', (req, res, next) => {
      console.log(`🤖 Chatbot route: ${req.method} ${req.path}`);
      next();
    }, chatbotRoutes);
    console.log('✅ Chatbot routes registered');

    // Upload routes
    app.use('/api/upload', (req, res, next) => {
      console.log(`📤 Upload route: ${req.method} ${req.path}`);
      next();
    }, uploadRoutes);
    console.log('✅ Upload routes registered');

    // Test endpoint
    app.get('/api/test', (req: Request, res: Response) => {
      res.json({ 
        message: 'API is working!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        database: dbConnected ? 'Connected' : 'Disconnected'
      });
    });
    console.log('✅ Test endpoint: GET /api/test');

    // Serve uploaded files
    app.use('/uploads', express.static('uploads'));
    console.log('✅ Static files: /uploads directory');

    // ==================== STEP 6: 404 HANDLER ====================
    app.use('*', (req: Request, res: Response) => {
      console.log(`\n 404 Not Found:`);
      console.log(`   Method: ${req.method}`);
      console.log(`   URL: ${req.originalUrl}`);
      
      res.status(404).json({ 
        success: false,
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        availableRoutes: [
          'GET /health',
          'GET /api/test',
          'POST /api/auth/register',
          'POST /api/auth/login',
          'GET /api/auth/test',
          'POST /api/upload/assets',
          'GET /api/assets',
          'POST /api/assets',
          'GET /api/library',
          'POST /api/chatbot/message'
        ]
      });
    });
    console.log('✅ 404 handler configured');

    // ==================== STEP 7: ERROR HANDLER ====================
    app.use(errorHandler);
    console.log('✅ Global error handler configured');

    // ==================== STEP 8: START SERVER ====================
    console.log('\n' + '='.repeat(50));
    console.log('🚀 STARTING EXPRESS SERVER');
    console.log('='.repeat(50));
    
    app.listen(PORT, () => {
      console.log('\n🎉 SERVER STARTED SUCCESSFULLY!');
      console.log('─'.repeat(40));
      console.log(`   🌐 Port: ${PORT}`);
      console.log(`   🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   🗄️  Database: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`   🧠 Gemini API: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
      console.log(`   🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
      console.log('\n   📍 Health Check:');
      console.log(`      GET http://localhost:${PORT}/health`);
      console.log('\n   📍 Test Endpoints:');
      console.log(`      GET  http://localhost:${PORT}/api/auth/test`);
      console.log(`      POST http://localhost:${PORT}/api/auth/register`);
      console.log(`      POST http://localhost:${PORT}/api/auth/login`);
      console.log('\n   📍 Main Endpoints:');
      console.log(`      GET  http://localhost:${PORT}/api/assets`);
      console.log(`      POST http://localhost:${PORT}/api/upload/assets`);
      console.log(`      POST http://localhost:${PORT}/api/chatbot/message`);
      console.log('\n' + '─'.repeat(40));
      console.log('✅ Server is ready to accept requests!\n');
    });
    
  } catch (error: any) {
    console.error('\n❌ SERVER INITIALIZATION FAILED!');
    console.error('─'.repeat(40));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check database connection string in .env');
    console.error('   2. Verify Railway database is running');
    console.error('   3. Check network connectivity');
    console.error('   4. Verify port ' + PORT + ' is available');
    console.error('\n🔄 Server will exit. Please fix the issues and restart.');
    process.exit(1);
  }
};

// 🔥 JALANKAN SERVER
startServer();

export default app;