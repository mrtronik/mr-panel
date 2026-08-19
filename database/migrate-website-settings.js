const db = require('../config/db');

async function migrate() {
    console.log('Creating website_settings table...');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS website_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            domain VARCHAR(255) NOT NULL UNIQUE,
            settings JSON DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ website_settings');

    console.log('Migration complete!');
}

migrate().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
