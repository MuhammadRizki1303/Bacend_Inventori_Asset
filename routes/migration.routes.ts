import { Router, Request, Response } from 'express';
import { databaseMigrator } from '../scripts/migrateDatabase';

const router = Router();

// POST /api/migration/run - Run database migration
router.post('/run', async (req: Request, res: Response) => {
  try {
    console.log('🔧 Starting manual database migration...');
    
    await databaseMigrator.migrate();
    
    res.json({
      success: true,
      message: 'Database migration completed successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/migration/status - Check migration status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const canConnect = await databaseMigrator.testConnection();
    const sqlFileExists = await databaseMigrator.checkSqlFile();
    
    res.json({
      database: {
        connected: canConnect,
        host: process.env.MYSQLHOST,
        database: process.env.MYSQLDATABASE
      },
      sqlFile: {
        exists: sqlFileExists,
        path: process.env.SQL_FILE_PATH || '../scripts/inventori.sql'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Status check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;