import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

// Gunakan environment variables yang sesuai
const connectionString = process.env.MYSQL_PUBLIC_URL || 
  `mysql://${process.env.MYSQLUSER || 'root'}:${process.env.MYSQLPASSWORD || ''}@${process.env.MYSQLHOST || 'localhost'}:${process.env.MYSQLPORT || 3306}/${process.env.MYSQLDATABASE || 'railway'}`;

console.log('🔗 Database connection string:', 
  connectionString.replace(/:([^:@]+)@/, ':****@')); // Hide password

// Buat pool dengan tipe yang benar
export const pool: Pool = mysql.createPool(connectionString);

console.log('✅ Database pool created successfully');

// CREATE ALL REQUIRED TABLES (Hanya untuk development/initial setup)
const initializeDatabase = async (): Promise<void> => {
  // Skip in production unless explicitly forced
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_DB_INIT) {
    console.log('📊 Skipping table creation in production');
    return;
  }

  let conn: PoolConnection | null = null;
  try {
    console.log('🔄 Checking database tables...');
    conn = await pool.getConnection();

    // 1. Users table
    const [userTables]: any = await conn.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_name = 'users'
    `);
    
    if (userTables[0].count === 0) {
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
          token_expiry DATETIME,
          last_login DATETIME,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ users table created');
      
      // Insert admin user
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await conn.query(`
        INSERT INTO users (name, email, password, role, email_verified, status) 
        VALUES ('Administrator', 'admin@example.com', ?, 'Admin', TRUE, 'Active')
      `, [hashedPassword]);
      console.log('✅ admin user created');
    } else {
      console.log('📊 users table already exists');
    }

    // 2. Check other tables (tidak perlu DROP TABLE)
    const tables = [
      { name: 'activity_log', sql: `
        CREATE TABLE IF NOT EXISTS activity_log (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          action VARCHAR(255) NOT NULL,
          entity_type VARCHAR(100) NOT NULL,
          entity_id INT,
          details JSON,
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `},
      { name: 'library_items', sql: `
        CREATE TABLE IF NOT EXISTS library_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          type ENUM('document','image','video','audio') NOT NULL,
          file_size BIGINT NOT NULL,
          file_path VARCHAR(500) NOT NULL,
          mime_type VARCHAR(100),
          uploaded_by INT NOT NULL,
          description TEXT,
          tags JSON,
          downloads INT DEFAULT 0,
          views INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `},
      { name: 'assets', sql: `
        CREATE TABLE IF NOT EXISTS assets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(100) NOT NULL,
          category VARCHAR(100) NOT NULL,
          status VARCHAR(20) DEFAULT 'active',
          value DECIMAL(10,2) DEFAULT 0.00,
          assigned_to INT,
          location VARCHAR(255),
          purchase_date DATE,
          last_maintenance DATE,
          description TEXT,
          file_path VARCHAR(500),
          file_size BIGINT,
          mime_type VARCHAR(100),
          tags JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_by INT
        )
      `},
      { name: 'device_stocks', sql: `
        CREATE TABLE IF NOT EXISTS device_stocks (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          category VARCHAR(100) NOT NULL,
          total_stock INT NOT NULL DEFAULT 0,
          available_stock INT NOT NULL DEFAULT 0,
          borrowed_count INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `},
      { name: 'borrowings', sql: `
        CREATE TABLE IF NOT EXISTS borrowings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          employee_name VARCHAR(255) NOT NULL,
          device_id INT NOT NULL,
          device_name VARCHAR(255) NOT NULL,
          quantity INT NOT NULL DEFAULT 1,
          borrow_date DATE NOT NULL,
          return_date DATE NOT NULL,
          status ENUM('borrowed','returned') DEFAULT 'borrowed',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `},
      { name: 'chat_history', sql: `
        CREATE TABLE IF NOT EXISTS chat_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          session_id VARCHAR(100) NOT NULL DEFAULT 'default',
          message TEXT NOT NULL,
          response TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `}
    ];

    for (const table of tables) {
      const [tableExists]: any = await conn.query(`
        SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_schema = DATABASE() AND table_name = ?
      `, [table.name]);
      
      if (tableExists[0].count === 0) {
        await conn.query(table.sql);
        console.log(`✅ ${table.name} table created`);
      } else {
        console.log(`📊 ${table.name} table already exists`);
      }
    }

    // Insert sample data only if tables were empty
    const [stockCount]: any = await conn.query('SELECT COUNT(*) as count FROM device_stocks');
    if (stockCount[0].count === 0) {
      await conn.query(`
        INSERT INTO device_stocks (name, category, total_stock, available_stock) 
        VALUES ('Laptop Dell', 'Electronics', 5, 5)
      `);
      console.log('✅ sample device stock created');
    }

    console.log('🎉 Database initialization completed!');

  } catch (error: any) {
    console.error('❌ Error initializing database:', error.message);
    console.error('Full error:', error);
  } finally {
    if (conn) {
      conn.release();
    }
  }
};

// Test database connection
const testConnection = async (): Promise<void> => {
  let retries = 5;
  while (retries > 0) {
    let conn: PoolConnection | null = null;
    try {
      console.log(`🔄 Testing database connection (attempts left: ${retries})...`);
      conn = await pool.getConnection();
      const [result]: any = await conn.query('SELECT 1 as connected');
      
      console.log('✅ Database connected successfully');
      console.log(`📊 Connection test result:`, result[0]);
      
      // Initialize database tables
      await initializeDatabase();
      return;
    } catch (error: any) {
      retries--;
      console.error(`❌ Database connection failed (${5 - retries}/5):`, error.message);
      
      if (retries === 0) {
        console.error('💥 Failed to connect to database after 5 attempts');
        if (process.env.NODE_ENV === 'development') {
          process.exit(1);
        }
        // In production, continue without database (optional)
      } else {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }
};

// Run connection test on startup
testConnection().catch(error => {
  console.error('💥 Failed to initialize database:', error);
});

// Export types
export type { PoolConnection };

// Export default
export default pool;