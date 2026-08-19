const db = require('../config/db');

async function migrateGDrive() {
  console.log('Creating Google Drive backup tables...');

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS gdrive_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        token_expiry DATETIME,
        folder_id VARCHAR(255) DEFAULT NULL,
        folder_name VARCHAR(255) DEFAULT 'MR Panel Backups',
        status ENUM('active', 'disconnected') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ gdrive_accounts table created');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('  ℹ gdrive_accounts table already exists');
    } else {
      console.error('  ✗ Error creating gdrive_accounts:', error.message);
    }
  }

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS gdrive_backups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        user_id INT NOT NULL,
        backup_type ENUM('files', 'database', 'email', 'all') NOT NULL,
        filename VARCHAR(255) NOT NULL,
        gdrive_file_id VARCHAR(255),
        gdrive_link VARCHAR(500),
        file_size BIGINT DEFAULT 0,
        file_size_formatted VARCHAR(50) DEFAULT '',
        components JSON,
        status ENUM('uploading', 'completed', 'failed', 'restoring') DEFAULT 'uploading',
        error_message TEXT,
        scheduled TINYINT(1) DEFAULT 0,
        schedule_cron VARCHAR(100) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME DEFAULT NULL,
        INDEX idx_account_id (account_id),
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_backup_type (backup_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ gdrive_backups table created');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('  ℹ gdrive_backups table already exists');
    } else {
      console.error('  ✗ Error creating gdrive_backups:', error.message);
    }
  }

  console.log('Google Drive migration completed!');
}

if (require.main === module) {
  migrateGDrive().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrateGDrive;
