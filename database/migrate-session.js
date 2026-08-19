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
            CREATE TABLE IF NOT EXISTS sessions (
                session_id VARCHAR(128) NOT NULL PRIMARY KEY,
                expires INT(11) UNSIGNED NOT NULL,
                data MEDIUMTEXT
            )
        `);

        console.log("Sessions table created");
        await conn.end();
        process.exit(0);
    } catch (err) {
        console.error("Failed:", err);
        if (conn) await conn.end();
        process.exit(1);
    }
}

migrate();
