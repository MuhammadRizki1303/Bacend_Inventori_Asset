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
    console.log('🔄 Creating/verifying tables...');

    // FIX: Drop table jika sudah ada (UNTUK DEVELOPMENT)
    if (process.env.NODE_ENV === 'development') {
      console.log('🗑️  Dropping existing users table for recreation...');
      try {
        await conn.query('DROP TABLE IF EXISTS users');
        console.log('✅ Old users table dropped');
      } catch (dropError) {
        console.log('ℹ️  No users table to drop');
      }
    }

    // Buat tabel users dengan AUTO_INCREMENT yang benar
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
      ) ENGINE=InnoDB AUTO_INCREMENT=1
    `);
    console.log('✅ users table ready');

    // Buat tabel assets
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

    // Cek jika admin user belum ada
    const [users]: any = await conn.query('SELECT COUNT(*) as count FROM users WHERE email = ?', ['admin@example.com']);
    if (users[0].count === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await conn.query(`
        INSERT INTO users (name, email, password, role, status) 
        VALUES ('Administrator', 'admin@example.com', ?, 'Admin', 'Active')
      `, [hashedPassword]);
      console.log('✅ Admin user created');
    }

    // FIX: Test insert data dummy untuk verifikasi AUTO_INCREMENT bekerja
    console.log('🧪 Testing AUTO_INCREMENT...');
    try {
      const [testResult]: any = await conn.query(`
        INSERT INTO users (name, email, password) 
        VALUES ('Test User', 'test@example.com', 'dummy')
      `);
      console.log('✅ AUTO_INCREMENT test passed, inserted ID:', testResult.insertId);
      
      // Hapus data test
      await conn.query('DELETE FROM users WHERE email = ?', ['test@example.com']);
    } catch (testError: any) {
      console.error('❌ AUTO_INCREMENT test failed:', testError.message);
    }

    console.log('🎉 Database initialization complete');
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