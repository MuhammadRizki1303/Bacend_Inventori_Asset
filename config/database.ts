import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const connectionString = process.env.MYSQL_PUBLIC_URL || 'mysql://root:pQpGmoZMExdKtjQeGrlNSnJPoMlrHcMw@hopper.proxy.rlwy.net:41017/railway';
const url = new URL(connectionString);

const pool = mysql.createPool({
  host: url.hostname,
  port: parseInt(url.port),
  user: url.username,
  password: url.password,
  database: url.pathname.substring(1),
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// CREATE ALL REQUIRED TABLES
(async () => {
  const conn = await pool.getConnection();
  try {
    console.log('🔄 CREATING ALL DATABASE TABLES...');

    // 1. Users table
    // await conn.query('DROP TABLE IF EXISTS users');
    // await conn.query(`
    //   CREATE TABLE users (
    //     id INT AUTO_INCREMENT PRIMARY KEY,
    //     name VARCHAR(255) NOT NULL,
    //     email VARCHAR(255) UNIQUE NOT NULL,
    //     password VARCHAR(255) NOT NULL,
    //     phone VARCHAR(50),
    //     role VARCHAR(20) DEFAULT 'User',
    //     status VARCHAR(20) DEFAULT 'Active',
    //     department VARCHAR(100),
    //     email_verified BOOLEAN DEFAULT FALSE,
    //     verification_token VARCHAR(255),
    //     token_expiry DATETIME,
    //     last_login DATETIME,
    //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    //     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    //   )
    // `);
    // console.log('✅ users table created');

    // 2. Activity Log table (fix missing details column)
    // await conn.query('DROP TABLE IF EXISTS activity_log');
    // await conn.query(`
    //   CREATE TABLE activity_log (
    //     id INT AUTO_INCREMENT PRIMARY KEY,
    //     user_id INT NOT NULL,
    //     action VARCHAR(255) NOT NULL,
    //     entity_type VARCHAR(100) NOT NULL,
    //     entity_id INT,
    //     details JSON,
    //     ip_address VARCHAR(45),
    //     user_agent TEXT,
    //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    //   )
    // `);
    // console.log('✅ activity_log table created');

    // 3. Library Items table
    await conn.query('DROP TABLE IF EXISTS library_items');
    await conn.query(`
      CREATE TABLE library_items (
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
    `);
    console.log('✅ library_items table created');

    // 4. Assets table
    await conn.query('DROP TABLE IF EXISTS assets');
    await conn.query(`
      CREATE TABLE assets (
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
    `);
    console.log('✅ assets table created');

    // 5. Device Stocks table
    await conn.query('DROP TABLE IF EXISTS device_stocks');
    await conn.query(`
      CREATE TABLE device_stocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        total_stock INT NOT NULL DEFAULT 0,
        available_stock INT NOT NULL DEFAULT 0,
        borrowed_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ device_stocks table created');

    // 6. Borrowings table
    await conn.query('DROP TABLE IF EXISTS borrowings');
    await conn.query(`
      CREATE TABLE borrowings (
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
    `);
    console.log('✅ borrowings table created');

    // 7. Chat History table
    await conn.query('DROP TABLE IF EXISTS chat_history');
    await conn.query(`
      CREATE TABLE chat_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        session_id VARCHAR(100) NOT NULL DEFAULT 'default',
        message TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ chat_history table created');

    // 8. Insert admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await conn.query(`
      INSERT INTO users (name, email, password, role, email_verified, status) 
      VALUES ('Administrator', 'admin@example.com', ?, 'Admin', TRUE, 'Active')
    `, [hashedPassword]);
    console.log('✅ admin user created');

    // 9. Insert sample data
    await conn.query(`
      INSERT INTO device_stocks (name, category, total_stock, available_stock) 
      VALUES ('Laptop Dell', 'Electronics', 5, 5)
    `);
    console.log('✅ sample device stock created');

    console.log('🎉 ALL TABLES CREATED SUCCESSFULLY!');

  } catch (error: any) {
    console.error('❌ Error creating tables:', error.message);
  } finally {
    conn.release();
  }
})();

export default pool;