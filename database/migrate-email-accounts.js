const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function migrateEmailAccounts() {
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
            CREATE TABLE IF NOT EXISTS email_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                username VARCHAR(100) NOT NULL,
                domain VARCHAR(255) NOT NULL,
                password_hash VARCHAR(500) NOT NULL,
                display_name VARCHAR(255) DEFAULT '',
                signature TEXT,
                quota BIGINT DEFAULT 0,
                used_bytes BIGINT DEFAULT 0,
                status ENUM('active','suspended','deleted') DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_domain (domain),
                INDEX idx_status (status)
            )
        `);

        try {
            await conn.query(`ALTER TABLE email_accounts ADD COLUMN display_name VARCHAR(255) DEFAULT '' AFTER password_hash`);
            console.log('[MIGRATE] Added display_name column');
        } catch (e) {
            if (e.code !== 'ER_DUP_COLUMNNAME') throw e;
        }

        try {
            await conn.query(`ALTER TABLE email_accounts ADD COLUMN signature TEXT AFTER display_name`);
            console.log('[MIGRATE] Added signature column');
        } catch (e) {
            if (e.code !== 'ER_DUP_COLUMNNAME') throw e;
        }

        console.log('Email accounts migration success');
        await conn.end();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        if (conn) await conn.end();
        process.exit(1);
    }
}

migrateEmailAccounts();
