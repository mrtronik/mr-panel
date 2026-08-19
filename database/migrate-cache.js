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

        // Add cache_api_key column
        try {
            await conn.query(`ALTER TABLE websites ADD COLUMN cache_api_key VARCHAR(64) DEFAULT NULL`);
            console.log('Added cache_api_key column');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('cache_api_key column already exists');
            } else throw e;
        }

        // Add cache_settings column (JSON)
        try {
            await conn.query(`ALTER TABLE websites ADD COLUMN cache_settings JSON DEFAULT NULL`);
            console.log('Added cache_settings column');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('cache_settings column already exists');
            } else throw e;
        }

        console.log('Cache migration completed');
        await conn.end();
        process.exit(0);
    } catch (err) {
        console.error('Cache migration failed:', err);
        if (conn) await conn.end();
        process.exit(1);
    }
}

migrate();
