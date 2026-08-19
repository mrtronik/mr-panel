const mysql = require('mysql2/promise');
const db = require('../config/db');

class DatabaseService {

    static getPool() {
        return mysql.createPool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            waitForConnections: true,
            connectionLimit: 5
        });
    }

    static async listDatabases(user = null) {
        if (!user || user.role === 'admin') {
            const pool = this.getPool();
            try {
                const [rows] = await pool.query('SHOW DATABASES');
                const skip = ['information_schema', 'performance_schema', 'mysql', 'sys'];
                return rows.filter(r => !skip.includes(r.Database)).map(r => r.Database);
            } finally {
                await pool.end();
            }
        }
        const [rows] = await db.execute(
            'SELECT db_name FROM user_databases WHERE user_id = ? ORDER BY db_name',
            [user.id]
        );
        return rows.map(r => r.db_name);
    }

    static async listTables(dbName) {
        const pool = this.getPool();
        try {
            await pool.query(`USE \`${dbName}\``);
            const [rows] = await pool.query('SHOW TABLES');
            const key = `Tables_in_${dbName}`;
            return rows.map(r => r[key]);
        } finally {
            await pool.end();
        }
    }

    static async getTableInfo(dbName, tableName) {
        const pool = this.getPool();
        try {
            await pool.query(`USE \`${dbName}\``);
            const [columns] = await pool.query(`DESCRIBE \`${tableName}\``);
            const [createTable] = await pool.query(`SHOW CREATE TABLE \`${tableName}\``);
            const [rowCount] = await pool.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
            return {
                columns,
                createTable: createTable[0]['Create Table'],
                rowCount: rowCount[0].count
            };
        } finally {
            await pool.end();
        }
    }

    static async createDatabase(dbName, userId = null) {
        const pool = this.getPool();
        try {
            await pool.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            if (userId) {
                await db.execute('INSERT INTO user_databases (user_id, db_name) VALUES (?, ?)', [userId, dbName]);
            }
            return { success: true };
        } finally {
            await pool.end();
        }
    }

    static async deleteDatabase(dbName, userId = null) {
        const pool = this.getPool();
        try {
            await pool.query(`DROP DATABASE \`${dbName}\``);
            await db.execute('DELETE FROM user_databases WHERE db_name = ?', [dbName]);
            return { success: true };
        } finally {
            await pool.end();
        }
    }

    static async canAccess(dbName, user) {
        if (!user) return false;
        if (user.role === 'admin') return true;
        const [rows] = await db.execute('SELECT user_id FROM user_databases WHERE db_name = ?', [dbName]);
        if (rows.length === 0) return true;
        const uid = rows[0].user_id;
        if (uid == user.id) return true;
        if (user.role === 'reseller') {
            const [owner] = await db.execute('SELECT id FROM users WHERE id = ? AND owner_id = ?', [uid, user.id]);
            return owner.length > 0;
        }
        return false;
    }

    static async listUsers() {
        const pool = this.getPool();
        try {
            const [rows] = await pool.query("SELECT User, Host FROM mysql.user WHERE User NOT IN ('root','mysql.sys','mysql.infoschema','mysql.session')");
            return rows.map(r => ({ user: r.User, host: r.Host }));
        } finally {
            await pool.end();
        }
    }

    static async createUser(username, password, host) {
        const pool = this.getPool();
        const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
        const safeHost = (host || '%').replace(/[^a-zA-Z0-9._%]/g, '');
        if (!safeUser) throw new Error('Invalid username');
        try {
            await pool.query(`CREATE USER \`${safeUser}\`@\`${safeHost}\` IDENTIFIED BY ?`, [password]);
            return { success: true };
        } finally {
            await pool.end();
        }
    }

    static async deleteUser(username, host) {
        const pool = this.getPool();
        const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
        const safeHost = (host || '%').replace(/[^a-zA-Z0-9._%]/g, '');
        try {
            await pool.query(`DROP USER \`${safeUser}\`@\`${safeHost}\``);
            return { success: true };
        } finally {
            await pool.end();
        }
    }

    static async grantPrivileges(username, dbName, host) {
        const pool = this.getPool();
        const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const safeHost = (host || '%').replace(/[^a-zA-Z0-9._%]/g, '');
        try {
            await pool.query(`GRANT ALL PRIVILEGES ON \`${safeDb}\`.* TO \`${safeUser}\`@\`${safeHost}\``);
            await pool.query('FLUSH PRIVILEGES');
            return { success: true };
        } finally {
            await pool.end();
        }
    }

    static async revokePrivileges(username, dbName, host) {
        const pool = this.getPool();
        const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const safeHost = (host || '%').replace(/[^a-zA-Z0-9._%]/g, '');
        try {
            await pool.query(`REVOKE ALL PRIVILEGES ON \`${safeDb}\`.* FROM \`${safeUser}\`@\`${safeHost}\``);
            await pool.query('FLUSH PRIVILEGES');
            return { success: true };
        } finally {
            await pool.end();
        }
    }

    static async getGrants(username, host) {
        const pool = this.getPool();
        const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
        const safeHost = (host || '%').replace(/[^a-zA-Z0-9._%]/g, '');
        try {
            const [rows] = await pool.query(`SHOW GRANTS FOR \`${safeUser}\`@\`${safeHost}\``);
            return rows.map(r => Object.values(r)[0]);
        } finally {
            await pool.end();
        }
    }
}

module.exports = DatabaseService;
