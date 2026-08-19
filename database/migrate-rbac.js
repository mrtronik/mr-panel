const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function migrateRbac() {
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE
        });

        const [userCols] = await conn.query('DESCRIBE users');
        const userFields = userCols.map(c => c.Field);

        if (!userFields.includes('owner_id')) {
            await conn.query('ALTER TABLE users ADD COLUMN owner_id INT DEFAULT NULL AFTER id');
            console.log('  + users.owner_id');
        }

        const [webCols] = await conn.query('DESCRIBE websites');
        const webFields = webCols.map(c => c.Field);

        if (!webFields.includes('user_id')) {
            await conn.query('ALTER TABLE websites ADD COLUMN user_id INT DEFAULT NULL AFTER id');
            console.log('  + websites.user_id');
        }

        const [emailCols] = await conn.query('DESCRIBE email_accounts');
        const emailFields = emailCols.map(c => c.Field);

        if (!emailFields.includes('user_id')) {
            await conn.query('ALTER TABLE email_accounts ADD COLUMN user_id INT DEFAULT NULL AFTER id');
            console.log('  + email_accounts.user_id');
        }

        const [pkgCols] = await conn.query('DESCRIBE packages');
        const pkgFields = pkgCols.map(c => c.Field);

        if (!pkgFields.includes('owner_id')) {
            await conn.query('ALTER TABLE packages ADD COLUMN owner_id INT DEFAULT NULL AFTER id');
            console.log('  + packages.owner_id');
        }

        await conn.query(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                action VARCHAR(100) NOT NULL,
                target_type VARCHAR(50) DEFAULT NULL,
                target_id INT DEFAULT NULL,
                details JSON DEFAULT NULL,
                ip_address VARCHAR(45) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_action (action),
                INDEX idx_created_at (created_at)
            )
        `);
        console.log('  + activity_logs table');

        await conn.query(`
            CREATE TABLE IF NOT EXISTS user_databases (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                db_name VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_db (db_name),
                INDEX idx_user_id (user_id)
            )
        `);
        console.log('  + user_databases table');

        const [admins] = await conn.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        if (admins.length > 0) {
            const adminId = admins[0].id;
            await conn.query('UPDATE users SET owner_id = NULL WHERE role = "admin"');
            console.log(`  * Admin user id=${adminId} owner_id=NULL (top level)`);
        }

        console.log('RBAC migration success');
        await conn.end();
        process.exit(0);
    } catch (err) {
        console.error('RBAC migration failed:', err.message);
        if (conn) await conn.end();
        process.exit(1);
    }
}

migrateRbac();
