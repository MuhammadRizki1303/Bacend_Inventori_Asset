// database.ts
import mysql, { Pool } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.MYSQL_PUBLIC_URL || 
  'mysql://root:pQpGmoZMExdKtjQeGrlNSnJPoMlrHcMw@hopper.proxy.rlwy.net:41017/railway';

export const pool: Pool = mysql.createPool(connectionString);

// Auto-create tables
const initTables = async () => {
  const conn = await pool.getConnection();
  try {
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
        token_expiry DATETIME,
        last_login DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table ready');
  } catch (error) {
    console.error('❌ Error creating tables:', error);
  } finally {
    conn.release();
  }
};

// Panggil init
initTables();

export default pool;