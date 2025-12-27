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

    // 🚨 FIX: CEK DULU APAKAH TABEL SUDAH ADA DAN SCHEMA BENAR
    console.log('🔍 Checking existing users table structure...');
    
    // Cek apakah tabel users ada
    const [tables]: any = await conn.query(`SHOW TABLES LIKE 'users'`);
    
    if (tables.length > 0) {
      console.log('ℹ️  Users table already exists. Checking schema...');
      
      // Cek apakah kolom id punya AUTO_INCREMENT
      const [columns]: any = await conn.query(`
        SHOW COLUMNS FROM users WHERE Field = 'id'
      `);
      
      if (columns.length > 0) {
        const idColumn = columns[0];
        const hasAutoIncrement = idColumn.Extra.toLowerCase().includes('auto_increment');
        
        if (!hasAutoIncrement) {
          console.log('⚠️  FIXING: Adding AUTO_INCREMENT to id column...');
          
          try {
            // 1. Cek apakah ada data di tabel
            const [rowCount]: any = await conn.query('SELECT COUNT(*) as count FROM users');
            
            if (rowCount[0].count === 0) {
              // Jika tabel kosong, drop dan recreate
              console.log('🗑️  Table is empty, dropping and recreating...');
              await conn.query('DROP TABLE users');
              
              // Buat tabel baru dengan AUTO_INCREMENT
              await conn.query(`
                CREATE TABLE users (
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
              console.log('✅ Users table recreated with AUTO_INCREMENT');
            } else {
              // Jika ada data, coba ALTER TABLE
              console.log('⚠️  Table has data, trying to modify column...');
              await conn.query(`
                ALTER TABLE users 
                MODIFY COLUMN id INT AUTO_INCREMENT PRIMARY KEY
              `);
              console.log('✅ AUTO_INCREMENT added to existing table');
            }
          } catch (alterError: any) {
            console.error('❌ Cannot modify table structure:', alterError.message);
            console.log('💡 Try running these SQL commands manually in Railway MySQL:');
            console.log(`
              1. SHOW CREATE TABLE users; -- Lihat struktur
              2. ALTER TABLE users MODIFY id INT AUTO_INCREMENT PRIMARY KEY;
              3. atau DROP TABLE users; dan buat ulang
            `);
          }
        } else {
          console.log('✅ id column already has AUTO_INCREMENT');
        }
      }
    } else {
      // Buat tabel baru jika belum ada
      console.log('📦 Creating new users table...');
      await conn.query(`
        CREATE TABLE users (
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
      console.log('✅ users table created');
    }

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

    // 🚨 FIX: INSERT ADMIN DENGAN MENYEBUTKAN KOLOM EXPLICIT
    console.log('👑 Checking admin user...');
    const [users]: any = await conn.query('SELECT COUNT(*) as count FROM users WHERE email = ?', ['admin@example.com']);
    
    if (users[0].count === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      // 🚨 FIX: JANGAN MASUKKAN ID, biarkan AUTO_INCREMENT bekerja
      await conn.query(`
        INSERT INTO users (name, email, password, role, email_verified, status) 
        VALUES (?, ?, ?, 'Admin', TRUE, 'Active')
      `, ['Administrator', 'admin@example.com', hashedPassword]);
      
      console.log('✅ Admin user created');
    } else {
      console.log('✅ Admin user already exists');
    }

    console.log('🎉 Database initialization complete');
  } catch (error: any) {
    console.error('❌ Database initialization error:', error.message);
    console.error('SQL Error Code:', error.code);
    console.error('SQL Message:', error.sqlMessage);
    
    // Jangan exit, biarkan server tetap running
    console.log('⚠️  Continuing server startup despite database error...');
  } finally {
    if (conn) conn.release();
  }
};

// Export types
export type { PoolConnection };
export default pool;