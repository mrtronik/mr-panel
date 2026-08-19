const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function migrateUsers() {
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: 'mrpanel'
        });

        const [columns] = await conn.query('DESCRIBE users');
        const existingCols = columns.map(c => c.Field);

        if (!existingCols.includes('username')) {
            await conn.query(`ALTER TABLE users ADD COLUMN username VARCHAR(100) UNIQUE AFTER name`);
        }
        if (!existingCols.includes('role')) {
            await conn.query(`ALTER TABLE users ADD COLUMN role ENUM('admin','reseller','user') DEFAULT 'user' AFTER password`);
        }
        if (!existingCols.includes('status')) {
            await conn.query(`ALTER TABLE users ADD COLUMN status ENUM('active','suspended','deleted') DEFAULT 'active' AFTER role`);
        }
        if (!existingCols.includes('home_dir')) {
            await conn.query(`ALTER TABLE users ADD COLUMN home_dir VARCHAR(500) DEFAULT NULL AFTER status`);
        }
        if (!existingCols.includes('package_id')) {
            await conn.query(`ALTER TABLE users ADD COLUMN package_id INT DEFAULT NULL AFTER home_dir`);
        }
        if (!existingCols.includes('disk_used')) {
            await conn.query(`ALTER TABLE users ADD COLUMN disk_used BIGINT DEFAULT 0 AFTER package_id`);
        }
        if (!existingCols.includes('last_login')) {
            await conn.query(`ALTER TABLE users ADD COLUMN last_login DATETIME DEFAULT NULL AFTER disk_used`);
        }

        await conn.query(`
            CREATE TABLE IF NOT EXISTS packages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                disk_limit BIGINT DEFAULT 1073741824,
                bandwidth_limit BIGINT DEFAULT 10737418240,
                max_domains INT DEFAULT 10,
                max_email INT DEFAULT 10,
                max_database INT DEFAULT 10,
                price DECIMAL(10,2) DEFAULT 0,
                status ENUM('active','inactive') DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const [pkgCheck] = await conn.query('SELECT COUNT(*) as cnt FROM packages');
        if (pkgCheck[0].cnt === 0) {
            await conn.query(`INSERT INTO packages (name, disk_limit, bandwidth_limit, max_domains, max_email, max_database, price) VALUES
                ('Free', 1073741824, 1073741824, 1, 1, 1, 0),
                ('Basic', 5368709120, 53687091200, 5, 5, 5, 29.90),
                ('Pro', 21474836480, 107374182400, 20, 20, 20, 79.90),
                ('Enterprise', 107374182400, 536870912000, 100, 100, 100, 199.90)
            `);
        }

        const [userCheck] = await conn.query('SELECT COUNT(*) as cnt FROM users WHERE role = "admin"');
        if (userCheck[0].cnt === 0) {
            await conn.query(`UPDATE users SET role = 'admin', username = 'admin', home_dir = '/home/admin' WHERE email = 'admin@mrpanel.com'`);
        }

        console.log('Users migration success');
        await conn.end();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        if (conn) await conn.end();
        process.exit(1);
    }
}

migrateUsers();
