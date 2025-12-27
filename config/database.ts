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

    // ==================== HAPUS DAN RECREATE DEVICE_STOCKS TABLE ====================
    console.log('⚠️ Dropping old device_stocks table...');
    await conn.query('DROP TABLE IF EXISTS device_stocks');
    
    console.log('📦 Creating NEW device_stocks table with AUTO_INCREMENT...');
    await conn.query(`
      CREATE TABLE device_stocks (
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
    console.log('✅ NEW device_stocks table created with AUTO_INCREMENT');

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
    console.log('📦 Creating library_items table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS library_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        file_size BIGINT,
        file_path VARCHAR(500),
        mime_type VARCHAR(100),
        uploaded_by INT,
        description TEXT,
        tags JSON,
        downloads INT DEFAULT 0,
        views INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_uploaded_by (uploaded_by),
        INDEX idx_type (type),
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB AUTO_INCREMENT=1
    `);
    console.log('✅ library_items table ready');

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

    // ==================== MAINTENANCE_LOG TABLE ====================
    console.log('📦 Creating maintenance_log table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS maintenance_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_stock_id INT NOT NULL,
        maintenance_type ENUM('routine', 'repair', 'upgrade', 'inspection') DEFAULT 'routine',
        description TEXT NOT NULL,
        cost DECIMAL(10,2),
        performed_by VARCHAR(255),
        performed_date DATE NOT NULL,
        next_maintenance_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_device_stock_id (device_stock_id),
        INDEX idx_maintenance_date (performed_date),
        FOREIGN KEY (device_stock_id) REFERENCES device_stock(id) ON DELETE CASCADE
      ) ENGINE=InnoDB AUTO_INCREMENT=1
    `);
    console.log('✅ maintenance_log table ready');

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

    // ==================== VERIFIKASI STRUCTURE DEVICE_STOCKS ====================
    console.log('\n🔍 Verifying device_stocks table structure...');
    try {
      const [columns]: any = await conn.query(`DESCRIBE device_stocks`);
      const idColumn = columns.find((col: any) => col.Field === 'id');
      console.log(`📊 device_stocks.id: Type=${idColumn?.Type}, Extra=${idColumn?.Extra}`);
      
      if (idColumn?.Extra?.includes('auto_increment')) {
        console.log('✅ device_stocks.id has AUTO_INCREMENT');
      } else {
        console.log('❌ device_stocks.id does NOT have AUTO_INCREMENT');
      }
    } catch (e) {
      console.log('⚠️  Could not verify device_stocks table');
    }

    // ==================== TEST INSERT DEVICE ====================
    console.log('\n🧪 Testing device insertion...');
    try {
      const [result]: any = await conn.query(
        'INSERT INTO device_stocks (name, category, total_stock, available_stock, borrowed_count) VALUES (?, ?, ?, ?, ?)',
        ['Test Device', 'Keyboard', 5, 5, 0]
      );
      console.log(`✅ Test device inserted successfully! Insert ID: ${result.insertId}`);
      
      // Cek data yang baru diinsert
      const [devices]: any = await conn.query('SELECT * FROM device_stocks WHERE id = ?', [result.insertId]);
      console.log(`📋 Test device data: ${JSON.stringify(devices[0])}`);
    } catch (error: any) {
      console.error(`❌ Test device insertion failed: ${error.message}`);
      console.error(`SQL: ${error.sql}`);
    }

    console.log('\n🎉 DATABASE TABLES REINITIALIZED SUCCESSFULLY!');
    console.log('⚠️  NOTE: All previous device_stocks and borrowings data has been cleared.');

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