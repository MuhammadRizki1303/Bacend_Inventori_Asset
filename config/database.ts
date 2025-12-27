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
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ users table ready');

    // ==================== ACTIVITY_LOG TABLE ====================
    console.log('🔍 FIXING activity_log table DEFINITIVELY...');
    
    try {
      // 🚨 STEP 1: Nonaktifkan foreign key checks
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      
      // 🚨 STEP 2: Drop tabel jika sudah ada (bersih-bersih total)
      await conn.query('DROP TABLE IF EXISTS activity_log');
      console.log('🗑️  Dropped old activity_log table');
      
      // 🚨 STEP 3: Buat tabel baru dengan AUTO_INCREMENT yang BENAR
      await conn.query(`
        CREATE TABLE activity_log (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          action VARCHAR(255) NOT NULL,
          entity_type ENUM('user', 'asset', 'library', 'system') DEFAULT 'user',
          entity_id INT,
          details LONGTEXT,
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_created_at (created_at),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB AUTO_INCREMENT=1
      `);
      
      console.log('✅ activity_log table created with AUTO_INCREMENT');
      
      // 🚨 STEP 4: Aktifkan kembali foreign key checks
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      
    } catch (activityLogError: any) {
      console.error('❌ CRITICAL: Could not create activity_log table:', activityLogError.message);
      
      // Coba cara alternatif tanpa foreign key dulu
      try {
        console.log('🔄 Trying alternative: creating activity_log without foreign key...');
        await conn.query(`
          CREATE TABLE IF NOT EXISTS activity_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            action VARCHAR(255) NOT NULL,
            entity_type VARCHAR(50),
            entity_id INT,
            details LONGTEXT,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('✅ activity_log table created (without foreign key)');
      } catch (altError: any) {
        console.error('❌ Even alternative method failed:', altError.message);
      }
    }

    // ==================== ASSETS TABLE ====================
    console.log('🔍 Creating/verifying assets table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        category VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        value DECIMAL(10,2) DEFAULT 0.00,
        location VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
      )
    `);
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
      
      console.log('✅ Admin user created: admin@example.com / admin123');
    } else {
      console.log('✅ Admin user already exists');
    }

    // ==================== VERIFIKASI TABEL ====================
    console.log('🔍 Verifying table structures...');
    
    // Cek users table
    const [userColumns]: any = await conn.query('DESCRIBE users');
    console.log(`📊 users table has ${userColumns.length} columns`);
    
    // Cek activity_log table
    try {
      const [activityColumns]: any = await conn.query('DESCRIBE activity_log');
      console.log(`📊 activity_log table has ${activityColumns.length} columns`);
      console.log('🔑 activity_log.id is AUTO_INCREMENT:', 
        activityColumns.find((col: any) => col.Field === 'id')?.Extra?.includes('auto_increment') ? '✅ YES' : '❌ NO');
    } catch (e) {
      console.log('⚠️  Could not verify activity_log table');
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