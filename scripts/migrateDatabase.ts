import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface MigrationConfig {
  host: string;
  user: string;
  password: string;
  port: string;
  database: string;
  sqlFile: string;
}

class DatabaseMigrator {
  private config: MigrationConfig;

  constructor() {
    this.config = {
      host: process.env.MYSQLHOST || 'mysql.railway.internal',
      user: process.env.MYSQLUSER || 'root',
      password: process.env.MYSQLPASSWORD || 'BajyClYofgbNHoLjCVADzGvoFekpCwvK',
      port: process.env.MYSQLPORT || '3306',
      database: process.env.MYSQLDATABASE || 'railway',
      sqlFile: process.env.SQL_FILE_PATH || 'inventori.sql'
    };
  }

  private async executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(`Error: ${error.message}`);
          return;
        }
        if (stderr) {
          reject(`Stderr: ${stderr}`);
          return;
        }
        resolve(stdout);
      });
    });
  }

  public async testConnection(): Promise<boolean> {
    try {
      const testCommand = `mysql -h ${this.config.host} -u ${this.config.user} -p${this.config.password} -P ${this.config.port} -D ${this.config.database} -e "SELECT NOW() AS connection_test;"`;
      await this.executeCommand(testCommand);
      console.log('✅ Database connection successful');
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      return false;
    }
  }

  public async checkSqlFile(): Promise<boolean> {
    try {
      const filePath = path.resolve(this.config.sqlFile);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ SQL file not found: ${filePath}`);
        return false;
      }
      
      const stats = fs.statSync(filePath);
      console.log(`✅ SQL file found: ${filePath}`);
      console.log(`📁 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      return true;
    } catch (error) {
      console.error('❌ Error checking SQL file:', error);
      return false;
    }
  }

  public async migrate(): Promise<void> {
    console.log('🚀 Starting database migration...\n');
    
    // Check SQL file
    if (!await this.checkSqlFile()) {
      throw new Error('SQL file not found');
    }

    // Test connection
    if (!await this.testConnection()) {
      throw new Error('Database connection failed');
    }

    try {
      console.log('📦 Importing database...');
      
      // For Windows
      const importCommand = `Get-Content "${path.resolve(this.config.sqlFile)}" | mysql -h ${this.config.host} -u ${this.config.user} -p${this.config.password} -P ${this.config.port} -D ${this.config.database}`;
      
      // For Linux/Mac (uncomment if needed)
      // const importCommand = `mysql -h ${this.config.host} -u ${this.config.user} -p${this.config.password} -P ${this.config.port} -D ${this.config.database} < "${path.resolve(this.config.sqlFile)}"`;
      
      await this.executeCommand(importCommand);
      console.log('✅ Database import completed successfully!');

      // Verify migration
      await this.verifyMigration();
      
    } catch (error) {
      console.error('❌ Database migration failed:', error);
      throw error;
    }
  }

  private async verifyMigration(): Promise<void> {
    try {
      console.log('\n🔍 Verifying migration...');
      
      const verifyCommand = `mysql -h ${this.config.host} -u ${this.config.user} -p${this.config.password} -P ${this.config.port} -D ${this.config.database} -e "SHOW TABLES;"`;
      const result = await this.executeCommand(verifyCommand);
      
      console.log('📊 Tables in database:');
      console.log(result);
      
      const tableCount = result.split('\n').filter(line => line.trim()).length - 1;
      console.log(`✅ Migration verified! Found ${tableCount} tables.`);
      
    } catch (error) {
      console.error('❌ Verification failed:', error);
    }
  }
}

// Export for use in routes
export const databaseMigrator = new DatabaseMigrator();

// Run directly if this file is executed
if (require.main === module) {
  databaseMigrator.migrate()
    .then(() => {
      console.log('\n🎉 Database migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Database migration failed:', error);
      process.exit(1);
    });
}