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

    // ==================== USERS TABLE ====================
    console.log('📦 Creating users table...');
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
      ) ENGINE=InnoDB AUTO_INCREMENT=1
    `);
    console.log('✅ users table ready');

    // ==================== DEVICE_STOCKS TABLE (Tabel untuk stok keseluruhan) ====================
    console.log('📦 Creating device_stocks table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS device_stocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        total_stock INT NOT NULL DEFAULT 0,
        available_stock INT NOT NULL DEFAULT 0,
        borrowed_count INT NOT NULL DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_category (category),
        INDEX idx_available (available_stock)
      ) ENGINE=InnoDB AUTO_INCREMENT=1
    `);
    console.log('✅ device_stocks table ready');

    // ==================== DEVICE_STOCK TABLE (Tabel untuk tracking perangkat individual) ====================
    console.log('📦 Creating device_stock table (individual devices)...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS device_stock (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_stocks_id INT NOT NULL,
        serial_number VARCHAR(100) UNIQUE NOT NULL,
        asset_tag VARCHAR(100),
        status ENUM('available', 'borrowed', 'maintenance', 'retired', 'lost') DEFAULT 'available',
        condition ENUM('excellent', 'good', 'fair', 'poor') DEFAULT 'good',
        purchase_date DATE,
        purchase_price DECIMAL(10,2),
        warranty_expiry DATE,
        notes TEXT,
        last_maintenance_date DATE,
        next_maintenance_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_device_stocks_id (device_stocks_id),
        INDEX idx_serial_number (serial_number),
        INDEX idx_status (status),
        INDEX idx_condition (condition),
        FOREIGN KEY (device_stocks_id) REFERENCES device_stocks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB AUTO_INCREMENT=1
    `);
    console.log('✅ device_stock table ready');

    // ==================== LIBRARY_ITEMS TABLE ====================
    

    // ==================== ACTIVITY_LOG TABLE ====================
    console.log('📦 Creating activity_log table...');
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

    // Enable foreign key checks kembali
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

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

    // ==================== VERIFIKASI SEMUA TABEL ====================
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