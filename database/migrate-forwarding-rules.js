const db = require('../config/db');

async function migrateForwardingRules() {
  console.log('Creating forwarding rules tables...');

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS forwarding_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT DEFAULT NULL,
        email_account_id INT DEFAULT NULL,
        rule_name VARCHAR(255) NOT NULL,
        rule_type ENUM('keyword', 'domain', 'all') NOT NULL DEFAULT 'keyword',
        keyword VARCHAR(255) DEFAULT NULL,
        domain VARCHAR(255) DEFAULT NULL,
        destination_email VARCHAR(255) NOT NULL,
        action ENUM('forward', 'forward_copy', 'redirect') NOT NULL DEFAULT 'forward',
        priority INT DEFAULT 0,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_email_account_id (email_account_id),
        INDEX idx_rule_type (rule_type),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ forwarding_rules table created');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('  ℹ forwarding_rules table already exists');
    } else {
      console.error('  ✗ Error creating forwarding_rules:', error.message);
    }
  }

  console.log('Forwarding rules migration completed!');
}

if (require.main === module) {
  migrateForwardingRules().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrateForwardingRules;
