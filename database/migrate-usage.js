const db = require('../config/db');

async function migrate() {
    console.log('Creating usage tracking tables...');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS website_usage (
            id INT AUTO_INCREMENT PRIMARY KEY,
            domain VARCHAR(255) NOT NULL,
            disk_bytes BIGINT DEFAULT 0,
            bandwidth_in BIGINT DEFAULT 0,
            bandwidth_out BIGINT DEFAULT 0,
            snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_domain (domain),
            INDEX idx_snapshot (snapshot_at)
        )
    `);
    console.log('  ✓ website_usage');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS website_usage_summary (
            id INT AUTO_INCREMENT PRIMARY KEY,
            domain VARCHAR(255) NOT NULL UNIQUE,
            disk_bytes BIGINT DEFAULT 0,
            bandwidth_total BIGINT DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_domain (domain)
        )
    `);
    console.log('  ✓ website_usage_summary');

    console.log('Migration complete!');
}

migrate().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
