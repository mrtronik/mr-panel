const db = require('../config/db');

async function migrate() {
    console.log('Creating DNS tables...');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS dns_zones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            user_id INT DEFAULT NULL,
            mode ENUM('powerdns','cloudflare','external') DEFAULT 'powerdns',
            status ENUM('active','suspended') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);
    console.log('  dns_zones');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS dns_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            zone_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            type VARCHAR(10) NOT NULL,
            content TEXT NOT NULL,
            ttl INT DEFAULT 3600,
            prio INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (zone_id) REFERENCES dns_zones(id) ON DELETE CASCADE
        )
    `);
    console.log('  dns_records');

    console.log('DNS migration complete!');
}

migrate().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
