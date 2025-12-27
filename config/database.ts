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

export const initDatabase = async (): Promise<void> => {
  const isConnected = await testConnection();
  if (!isConnected) {
    console.log('⚠️  Skipping table creation due to connection failure');
    return;
  }

  let conn: PoolConnection | null = null;
  try {
    conn = await pool.getConnection();
    console.log('🔄 Creating/verifying ALL tables...');

    // Disable foreign key checks
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // ... [kode untuk tabel users, device_stocks, device_stock, borrowings, assets, library_items sama seperti sebelumnya]

    // ==================== ACTIVITY_LOG TABLE ====================
    console.log('📦 Creating/updating activity_log table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(255) NOT NULL,
        entity_type ENUM('user', 'asset', 'library', 'device', 'device_stock', 'borrowing', 'system') DEFAULT 'user',
        entity_id INT,
        details LONGTEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_entity (entity_type, entity_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB AUTO_INCREMENT=1
    `);
    console.log('✅ activity_log table ready');

    // ==================== MAINTENANCE_LOG TABLE ====================
    // Enable foreign key checks kembali
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // ==================== PERBAIKI ENUM ACTIVITY_LOG ====================
    console.log('🔧 Ensuring activity_log enum contains all values...');
    try {
      await conn.query(`
        ALTER TABLE activity_log 
        MODIFY COLUMN entity_type ENUM('user', 'asset', 'library', 'device', 'device_stock', 'borrowing', 'system') DEFAULT 'user'
      `);
      console.log('✅ activity_log enum values updated');
    } catch (e: any) {
      console.log('ℹ️  activity_log enum already correct or could not be modified:', e.message);
    }

    // ==================== CREATE ADMIN USER ====================
    console.log('👑 Checking admin user...');
    const [users]: any = await conn.query('SELECT COUNT(*) as count FROM users WHERE email = ?', ['admin@example.com']);
    
    if (users[0].count === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await conn.query(
        'INSERT INTO users (name, email, password, role, email_verified, status) VALUES (?, ?, ?, ?, ?, ?)',
        ['Administrator', 'admin@example.com', hashedPassword, 'Admin', true, 'Active']
      );
      console.log('✅ Admin user created');
    }

    // ==================== VERIFIKASI ALL TABLES ====================
    console.log('\n🔍 Verifying all table structures...');
    const tables = ['users', 'device_stocks', 'device_stock', 'borrowings', 'assets', 'library_items', 'activity_log', 'maintenance_log'];
    
    for (const table of tables) {
      try {
        const [columns]: any = await conn.query(`DESCRIBE ${table}`);
        const hasAutoIncrement = columns.some((col: any) => 
          col.Field === 'id' && col.Extra?.includes('auto_increment')
        );
        console.log(`📊 ${table}: ${columns.length} columns, AUTO_INCREMENT: ${hasAutoIncrement ? '✅' : '❌'}`);
      } catch (e) {
        console.log(`⚠️  Could not verify ${table} table`);
      }
    }

    // ==================== VERIFIKASI ENUM VALUES ====================
    console.log('\n🔍 Checking enum values...');
    try {
      const [activityLogInfo]: any = await conn.query(`SHOW COLUMNS FROM activity_log LIKE 'entity_type'`);
      console.log(`📊 activity_log.entity_type enum values: ${activityLogInfo[0]?.Type}`);
    } catch (e) {
      console.log('⚠️  Could not check enum values');
    }

    console.log('\n🎉 ALL DATABASE TABLES INITIALIZED SUCCESSFULLY!');

  } catch (error: any) {
    console.error('❌ Database initialization error:', error.message);
    console.error('Full error:', error);
  } finally {
    if (conn) conn.release();
  }
};

// Export types
export type { PoolConnection };
export default pool;