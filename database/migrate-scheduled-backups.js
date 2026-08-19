const db = require('../config/db');

async function migrateScheduledBackups() {
  console.log('Creating scheduled backups table...');

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS scheduled_backups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        account_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        backup_type ENUM('files', 'database', 'email', 'all') NOT NULL DEFAULT 'all',
        cron_expression VARCHAR(100) NOT NULL,
        status ENUM('active', 'paused', 'error') DEFAULT 'active',
        last_run DATETIME DEFAULT NULL,
        last_status ENUM('success', 'failed') DEFAULT NULL,
        last_error TEXT,
        next_run DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_next_run (next_run)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ scheduled_backups table created');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('  ℹ scheduled_backups table already exists');
    } else {
      console.error('  ✗ Error creating scheduled_backups:', error.message);
    }
  }

  console.log('Scheduled backups migration completed!');
}

if (require.main === module) {
  migrateScheduledBackups().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrateScheduledBackups;
