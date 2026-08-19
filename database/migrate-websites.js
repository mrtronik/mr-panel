const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function migrate() {
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE
        });

        await conn.query(`
            CREATE TABLE IF NOT EXISTS websites (
                id INT AUTO_INCREMENT PRIMARY KEY,
                domain VARCHAR(255) UNIQUE NOT NULL,
                document_root VARCHAR(500) NOT NULL,
                php_version VARCHAR(10) DEFAULT '8.2',
                ssl_status ENUM('none', 'active', 'expired') DEFAULT 'none',
                status ENUM('active', 'suspended', 'pending') DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        console.log("Websites table created");
        await conn.end();
        process.exit(0);
    } catch (err) {
        console.error("Failed:", err);
        if (conn) await conn.end();
        process.exit(1);
    }
}

migrate();
