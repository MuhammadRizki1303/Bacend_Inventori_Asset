import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

console.log('🚀 Starting database initialization...');

// Gunakan connection string langsung (Railway)
const connectionString = process.env.MYSQL_PUBLIC_URL || 
  'mysql://root:pQpGmoZMExdKtjQeGrlNSnJPoMlrHcMw@hopper.proxy.rlwy.net:41017/railway';

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

    // Buat tabel users
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ assets table ready');

    // Cek jika admin user belum ada
    const [users]: any = await conn.query('SELECT COUNT(*) as count FROM users WHERE email = ?', ['admin@example.com']);
    if (users[0].count === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await conn.query(`
        INSERT INTO users (name, email, password, role, email_verified, status) 
        VALUES ('Administrator', 'admin@example.com', ?, 'Admin', TRUE, 'Active')
      `, [hashedPassword]);
      console.log('✅ Admin user created');
    }

    console.log('🎉 Database initialization complete');
  } catch (error: any) {
    console.error('❌ Database initialization error:', error.message);
  } finally {
    if (conn) conn.release();
  }
};

// Export types
export type { PoolConnection };
export default pool;