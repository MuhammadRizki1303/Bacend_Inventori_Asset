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

    // ==================== PERBAIKI DEVICE_STOCKS TABLE ====================
    console.log('🔄 Checking/Fixing device_stocks table...');
    await conn.query('DROP TABLE IF EXISTS device_stocks');
    
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
    console.log('✅ device_stocks table fixed with AUTO_INCREMENT');

    // ==================== PERBAIKI BORROWINGS TABLE (STRUKTUR LAMA) ====================
    console.log('🔄 Checking/Fixing borrowings table (ORIGINAL STRUCTURE)...');
    
    // Cek dulu apakah tabel ada dan strukturnya benar
    try {
      const [columns]: any = await conn.query(`DESCRIBE borrowings`);
      const idColumn = columns.find((col: any) => col.Field === 'id');
      
      // Jika kolom id tidak ada AUTO_INCREMENT, drop dan recreate
      if (!idColumn || !idColumn.Extra?.includes('auto_increment')) {
        console.log('⚠️  borrowings table has incorrect structure, dropping and recreating...');
        await conn.query('DROP TABLE IF EXISTS borrowings');
      }
    } catch (e) {
      console.log('ℹ️  borrowings table does not exist, creating new one...');
    }

    // Buat tabel borrowings dengan struktur LAMA (seperti di file image.png)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS borrowings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_name VARCHAR(255) NOT NULL,
        device_id INT NOT NULL,
        device_name VARCHAR(255) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        borrow_date DATE NOT NULL,
        return_date DATE,
        status ENUM('borrowed', 'returned', 'overdue') DEFAULT 'borrowed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_device_id (device_id),
        INDEX idx_status (status),
        INDEX idx_employee (employee_name),
        INDEX idx_borrow_date (borrow_date),
        FOREIGN KEY (device_id) REFERENCES device_stocks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB AUTO_INCREMENT=1
    `);
    console.log('✅ borrowings table ready (ORIGINAL STRUCTURE with AUTO_INCREMENT)');

   

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
        entity_type ENUM('user', 'asset', 'library', 'device', 'borrowing', 'system') DEFAULT 'user',
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

    // ==================== VERIFIKASI TABEL BORROWINGS ====================
    console.log('\n🔍 Verifying borrowings table structure...');
    try {
      const [columns]: any = await conn.query(`DESCRIBE borrowings`);
      console.log(`📊 borrowings table has ${columns.length} columns:`);
      
      for (const col of columns) {
        console.log(`   ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''} ${col.Extra || ''}`);
      }
      
      const idColumn = columns.find((col: any) => col.Field === 'id');
      if (idColumn?.Extra?.includes('auto_increment')) {
        console.log('✅ borrowings.id has AUTO_INCREMENT ✓');
      } else {
        console.log('❌ borrowings.id does NOT have AUTO_INCREMENT');
      }
    } catch (e) {
      console.log('⚠️  Could not verify borrowings table');
    }

    // ==================== TEST INSERT KE BORROWINGS ====================
    console.log('\n🧪 Testing borrowings insertion...');
    try {
      // Buat test device terlebih dahulu
      const [deviceResult]: any = await conn.query(
        'INSERT INTO device_stocks (name, category, total_stock, available_stock, borrowed_count) VALUES (?, ?, ?, ?, ?)',
        ['Dell Keyboard', 'Keyboard', 5, 5, 0]
      );
      const deviceId = deviceResult.insertId;
      
      // Test insert ke borrowings (struktur lama)
      const [borrowResult]: any = await conn.query(
        `INSERT INTO borrowings 
         (employee_name, device_id, device_name, quantity, borrow_date, return_date, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['Jane Smith', deviceId, 'Dell Keyboard', 1, '2025-12-27', '2025-12-28', 'borrowed']
      );
      
      console.log(`✅ borrowings test: Insert ID = ${borrowResult.insertId} ✓`);
      
      // Verifikasi data yang diinsert
      const [borrowData]: any = await conn.query('SELECT * FROM borrowings WHERE id = ?', [borrowResult.insertId]);
      console.log(`📋 Test borrowing data: ${JSON.stringify(borrowData[0])}`);
      
    } catch (error: any) {
      console.error(`❌ Test borrowing insertion failed: ${error.message}`);
      if (error.sql) console.error(`SQL: ${error.sql}`);
    }

    console.log('\n🎉 DATABASE INITIALIZATION COMPLETE!');
    console.log('✅ device_stocks and borrowings tables now have AUTO_INCREMENT');

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