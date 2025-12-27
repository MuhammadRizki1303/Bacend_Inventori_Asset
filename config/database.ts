import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

console.log('🚀 Starting database initialization...');

// Gunakan connection string langsung (Railway)
const connectionString = process.env.MYSQL_PUBLIC_URL || 
  'mysql://root:pQpGmoZMExdKtjQeGrlNSnJPoMlrHcMw@interchange.proxy.rlwy.net:48741/railway';

console.log('🔗 Connecting to database...');

// Buat pool dengan konfigurasi minimal
export const pool: Pool = mysql.createPool({
  uri: connectionString,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

console.log('✅ Database pool created');

// Test koneksi sederhana
export const testConnection = async (): Promise<boolean> => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connection successful');
    connection.release();
    return true;
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    console.error('💡 Please check:');
    console.error('   1. Database credentials');
    console.error('   2. Network connectivity');
    console.error('   3. Database server status');
    return false;
  }
};

// Buat tabel jika belum ada (tanpa retry logic yang kompleks)
export const initDatabase = async (): Promise<void> => {
  const isConnected = await testConnection();
  if (!isConnected) {
    console.log('⚠️  Skipping table creation due to connection failure');
    return;
  }

  let conn: PoolConnection | null = null;
  try {
    conn = await pool.getConnection();
    console.log('🔄 Creating/verifying tables...');

    // ==================== USERS TABLE ====================
    console.log('🔍 Checking/creating users table...');
    
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        role VARCHAR(20) DEFAULT 'User',
        status VARCHAR(20) DEFAULT 'Active',
        department VARCHAR(100),
        email_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        token_expiry TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ users table ready');

    // ==================== ACTIVITY_LOG TABLE ====================
    console.log('🔍 Checking/creating activity_log table...');
    
    try {
      // Coba buat tabel activity_log jika belum ada
      await conn.query(`
        CREATE TABLE IF NOT EXISTS activity_log (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          action VARCHAR(255) NOT NULL,
          entity_type ENUM('user', 'asset', 'library', 'system'),
          entity_id INT,
          details LONGTEXT,
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      console.log('✅ activity_log table created/verified');
      
      // 🚨 FIX: Cek apakah kolom id sudah AUTO_INCREMENT
      const [activityLogColumns]: any = await conn.query(`
        SHOW COLUMNS FROM activity_log WHERE Field = 'id'
      `);
      
      if (activityLogColumns.length > 0) {
        const idColumn = activityLogColumns[0];
        const hasAutoIncrement = idColumn.Extra.toLowerCase().includes('auto_increment');
        
        if (!hasAutoIncrement) {
          console.log('⚠️  FIXING: Adding AUTO_INCREMENT to activity_log.id column...');
          
          // Cek jika ada data
          const [rowCount]: any = await conn.query('SELECT COUNT(*) as count FROM activity_log');
          
          if (rowCount[0].count === 0) {
            // Tabel kosong, bisa ALTER
            await conn.query(`
              ALTER TABLE activity_log 
              MODIFY COLUMN id INT AUTO_INCREMENT PRIMARY KEY
            `);
            console.log('✅ AUTO_INCREMENT added to activity_log.id');
          } else {
            console.log('⚠️  activity_log has data, cannot modify automatically');
            console.log('💡 Please run manually in MySQL:');
            console.log('   ALTER TABLE activity_log MODIFY id INT AUTO_INCREMENT PRIMARY KEY;');
          }
        } else {
          console.log('✅ activity_log.id already has AUTO_INCREMENT');
        }
      }
    } catch (activityLogError: any) {
      console.error('❌ Error with activity_log table:', activityLogError.message);
      console.log('⚠️  Continuing without activity_log table...');
    }
    
    console.log('✅ assets table ready');

    // ==================== CREATE ADMIN USER ====================
    console.log('👑 Checking admin user...');
    const [users]: any = await conn.query('SELECT COUNT(*) as count FROM users WHERE email = ?', ['admin@example.com']);
    
    if (users[0].count === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await conn.query(`
        INSERT INTO users (name, email, password, role, email_verified, status) 
        VALUES (?, ?, ?, 'Admin', TRUE, 'Active')
      `, ['Administrator', 'admin@example.com', hashedPassword]);
      
      console.log('✅ Admin user created');
      
      // Log admin creation activity (jika activity_log sudah fixed)
      try {
        const [adminResult]: any = await conn.query('SELECT id FROM users WHERE email = ?', ['admin@example.com']);
        if (adminResult.length > 0) {
          await conn.query(
            'INSERT INTO activity_log (user_id, action, entity_type) VALUES (?, ?, ?)',
            [adminResult[0].id, 'Admin user created', 'system']
          );
        }
      } catch (logError) {
        console.log('ℹ️  Could not log admin creation (activity_log issue)');
      }
    } else {
      console.log('✅ Admin user already exists');
    }

    console.log('🎉 Database initialization complete');
  } catch (error: any) {
    console.error('❌ Database initialization error:', error.message);
    console.error('SQL Error Code:', error.code);
    console.error('SQL Message:', error.sqlMessage);
  } finally {
    if (conn) conn.release();
  }
};
// Export types
export type { PoolConnection };
export default pool;