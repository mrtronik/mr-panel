const db = require('../config/db');

async function migrateSettings() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                \`key\` VARCHAR(255) NOT NULL UNIQUE,
                value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('[MIGRATE] settings table ready');

        // Seed default values if empty
        const [rows] = await db.query('SELECT COUNT(*) as cnt FROM settings');
        if (rows[0].cnt === 0) {
            const defaults = {
                'app_name': 'MR Panel',
                'app_url': process.env.APP_URL || 'http://103.191.63.147:1708',
                'server_ip': '103.191.63.147',
                'ns1': 'ns1.example.com',
                'ns2': 'ns2.example.com',
                'whmcs_api_key': '',
                'whmcs_api_secret': '',
                'whmcs_jwt_secret': ''
            };
            for (const [key, value] of Object.entries(defaults)) {
                await db.query('INSERT IGNORE INTO settings (`key`, value) VALUES (?, ?)', [key, value]);
            }
            console.log('[MIGRATE] Default settings seeded');
        }

        // whmcs_service_map
        await db.query(`
            CREATE TABLE IF NOT EXISTS whmcs_service_map (
                service_id VARCHAR(64) PRIMARY KEY,
                website_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('[MIGRATE] whmcs_service_map table ready');

    } catch (err) {
        console.error('[MIGRATE] Settings error:', err.message);
    } finally {
        process.exit();
    }
}

migrateSettings();
