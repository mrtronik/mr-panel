const db = require('../config/db');

async function migrate() {
    console.log('Creating backup tracking tables...');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS backups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            domain VARCHAR(255) NOT NULL,
            type ENUM('full','files','database') DEFAULT 'full',
            file_path VARCHAR(500),
            file_size BIGINT DEFAULT 0,
            status ENUM('running','completed','failed') DEFAULT 'running',
            user_id INT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_domain (domain),
            INDEX idx_status (status)
        )
    `);
    console.log('  ✓ backups');

    console.log('Migration complete!');
}

migrate().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
