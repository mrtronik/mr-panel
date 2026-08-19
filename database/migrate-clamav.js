const db = require('../config/db');

async function migrateClamAV() {
  console.log('Creating ClamAV tables...');

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS scan_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        scan_type ENUM('file', 'directory', 'uploaded') NOT NULL,
        target_path VARCHAR(500) NOT NULL,
        result ENUM('clean', 'infected', 'error') NOT NULL,
        virus_name VARCHAR(255) DEFAULT NULL,
        details TEXT,
        scanned_by INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_scan_type (scan_type),
        INDEX idx_result (result),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ scan_logs table created');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('  ℹ scan_logs table already exists');
    } else {
      console.error('  ✗ Error creating scan_logs:', error.message);
    }
  }

  console.log('ClamAV migration completed!');
}

if (require.main === module) {
  migrateClamAV().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrateClamAV;
