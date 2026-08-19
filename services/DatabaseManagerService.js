const mysql = require('mysql2');
const db = require('../config/db');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DatabaseManagerService {

    static async listDatabases(user) {
        if (user.role === 'admin') {
            const [rows] = await db.query('SHOW DATABASES');
            return rows.map(r => r.Database).filter(d => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(d));
        }

        if (user.role === 'reseller') {
            const [userDbs] = await db.execute('SELECT db_name FROM user_databases WHERE user_id = ? OR user_id IN (SELECT id FROM users WHERE owner_id = ?)', [user.id, user.id]);
            const owned = userDbs.map(r => r.db_name);
            const [allDbs] = await db.query('SHOW DATABASES');
            return allDbs.map(r => r.Database).filter(d => {
                if (['information_schema', 'performance_schema', 'mysql', 'sys'].includes(d)) return false;
                return owned.includes(d) || d.startsWith(user.username + '_');
            });
        }

        const [userDbs] = await db.execute('SELECT db_name FROM user_databases WHERE user_id = ?', [user.id]);
        const owned = userDbs.map(r => r.db_name);
        const [allDbs] = await db.query('SHOW DATABASES');
        return allDbs.map(r => r.Database).filter(d => {
            if (['information_schema', 'performance_schema', 'mysql', 'sys'].includes(d)) return false;
            return owned.includes(d) || d.startsWith(user.username + '_');
        });
    }

    static async canAccess(dbName, user) {
        if (user.role === 'admin') return true;

        const [userDbs] = await db.execute('SELECT db_name FROM user_databases WHERE user_id = ?', [user.id]);
        const owned = userDbs.map(r => r.db_name);

        if (owned.includes(dbName)) return true;
        if (dbName.startsWith(user.username + '_')) return true;

        if (user.role === 'reseller') {
            const [subDbs] = await db.execute('SELECT db_name FROM user_databases WHERE user_id IN (SELECT id FROM users WHERE owner_id = ?)', [user.id]);
            const subOwned = subDbs.map(r => r.db_name);
            if (subOwned.includes(dbName)) return true;
        }

        return false;
    }

    static async listTables(dbName) {
        const safeName = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const [rows] = await db.query('SHOW TABLES FROM `' + safeName + '`');
        return rows.map(r => Object.values(r)[0]);
    }

    static async tableStructure(dbName, tableName) {
        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        const [columns] = await db.query('SHOW FULL COLUMNS FROM `' + safeDb + '`.`' + safeTable + '`');
        const [indexes] = await db.query('SHOW INDEX FROM `' + safeDb + '`.`' + safeTable + '`');
        const [status] = await db.query('SHOW TABLE STATUS FROM `' + safeDb + '` LIKE ?', [tableName]);
        return { columns, indexes, status: status[0] || null };
    }

    static async browseTable(dbName, tableName, page = 1, limit = 25, search = '') {
        const offset = (page - 1) * limit;
        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');

        let whereClause = '';
        let params = [];

        if (search) {
            const [columns] = await db.query('SHOW COLUMNS FROM `' + safeDb + '`.`' + safeTable + '`');
            const conditions = columns.map(c => '`' + c.Field.replace(/[^a-zA-Z0-9_]/g, '') + '` LIKE ?');
            whereClause = ' WHERE ' + conditions.join(' OR ');
            params = columns.map(() => '%' + search + '%');
        }

        const [countResult] = await db.execute('SELECT COUNT(*) as total FROM `' + safeDb + '`.`' + safeTable + '`' + whereClause, params);
        const total = countResult[0].total;

        const [rows] = await db.query(
            'SELECT * FROM `' + safeDb + '`.`' + safeTable + '`' + whereClause + ' LIMIT ' + parseInt(limit) + ' OFFSET ' + parseInt(offset),
            params
        );

        const [columns] = await db.query('SHOW COLUMNS FROM `' + safeDb + '`.`' + safeTable + '`');

        return {
            data: rows,
            columns: columns.map(c => c.Field),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    static async executeQuery(dbName, sql) {
        const trimmed = sql.trim().toUpperCase();
        const forbidden = ['DROP DATABASE', 'TRUNCATE DATABASE', 'GRANT', 'REVOKE', 'CREATE USER', 'DROP USER', 'INSERT INTO', 'UPDATE ', 'DELETE FROM', 'ALTER USER', 'CREATE USER'];
        for (const f of forbidden) {
            if (trimmed.includes(f)) {
                throw new Error('Query not allowed: ' + f);
            }
        }
        // Only allow SELECT queries
        if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('SHOW') && !trimmed.startsWith('DESCRIBE') && !trimmed.startsWith('EXPLAIN')) {
            throw new Error('Only SELECT, SHOW, DESCRIBE, EXPLAIN queries are allowed');
        }

        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        await db.query('USE `' + safeDb + '`');
        const [result, fields] = await db.query(sql);
        return { result, fields };
    }

    static async insertRow(dbName, tableName, data) {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = 'INSERT INTO `' + dbName + '`.`' + tableName + '` (' + columns.map(c => '`' + c + '`').join(', ') + ') VALUES (' + placeholders + ')';
        const [result] = await db.execute(sql, values);
        return result;
    }

    static async updateRow(dbName, tableName, data, whereClause, whereParams, original) {
        if (original && !whereClause) {
            whereClause = Object.keys(original).map(k => '`' + k + '` = ?').join(' AND ');
            whereParams = Object.values(original);
        }
        const setClauses = Object.keys(data).map(k => '`' + k + '` = ?');
        const setValues = Object.values(data);
        const sql = 'UPDATE `' + dbName + '`.`' + tableName + '` SET ' + setClauses.join(', ') + ' WHERE ' + whereClause;
        const [result] = await db.execute(sql, [...setValues, ...whereParams]);
        return result;
    }

    static async deleteRow(dbName, tableName, whereClause, whereParams, original) {
        if (original && !whereClause) {
            whereClause = Object.keys(original).map(k => '`' + k + '` = ?').join(' AND ');
            whereParams = Object.values(original);
        }
        const sql = 'DELETE FROM `' + dbName + '`.`' + tableName + '` WHERE ' + whereClause;
        const [result] = await db.execute(sql, whereParams);
        return result;
    }

    static async createDatabase(dbName, user) {
        const safeName = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        await db.execute('CREATE DATABASE `' + safeName + '`');

        if (user.role !== 'admin') {
            try {
                await db.execute('INSERT INTO user_databases (user_id, db_name) VALUES (?, ?)', [user.id, safeName]);
            } catch (e) {}
        }

        return safeName;
    }

    static async dropDatabase(dbName, user) {
        if (user.role !== 'admin') {
            const [userDbs] = await db.execute('SELECT db_name FROM user_databases WHERE db_name = ? AND user_id = ?', [dbName, user.id]);
            if (userDbs.length === 0) {
                throw new Error('Access denied');
            }
        }
        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        await db.execute('DROP DATABASE `' + safeDb + '`');
        try {
            await db.execute('DELETE FROM user_databases WHERE db_name = ?', [dbName]);
        } catch (e) {}
        return true;
    }

    static async createTable(dbName, tableName, columns) {
        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        const colDefs = columns.map(c => {
            const safeName = c.name.replace(/[^a-zA-Z0-9_]/g, '');
            let def = '`' + safeName + '` ' + c.type;
            if (c.nullable !== 'YES') def += ' NOT NULL';
            if (c.key === 'PRI') def += ' PRIMARY KEY';
            if (c.autoIncrement) def += ' AUTO_INCREMENT';
            if (c.default !== undefined && c.default !== '') def += ' DEFAULT ' + mysql.escape(c.default);
            return def;
        }).join(', ');

        const sql = 'CREATE TABLE `' + safeDb + '`.`' + safeTable + '` (' + colDefs + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
        await db.execute(sql);
        return true;
    }

    static async dropTable(dbName, tableName) {
        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        await db.execute('DROP TABLE `' + safeDb + '`.`' + safeTable + '`');
        return true;
    }

    static async emptyTable(dbName, tableName) {
        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        await db.execute('TRUNCATE TABLE `' + safeDb + '`.`' + safeTable + '`');
        return true;
    }

    static async exportDatabase(dbName) {
        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const tables = await this.listTables(safeDb);
        let sql = '-- Export: `' + safeDb + '`\n-- Server version: MySQL\n\n';
        sql += 'DROP DATABASE IF EXISTS `' + safeDb + '`;\n';
        sql += 'CREATE DATABASE `' + safeDb + '`;\n';
        sql += 'USE `' + safeDb + '`;\n\n';

        for (const table of tables) {
            const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
            const [createTable] = await db.query('SHOW CREATE TABLE `' + safeDb + '`.`' + safeTable + '`');
            sql += 'DROP TABLE IF EXISTS `' + safeTable + '`;\n';
            sql += createTable[0]['Create Table'] + ';\n\n';

            const [rows] = await db.query('SELECT * FROM `' + safeDb + '`.`' + safeTable + '`');
            if (rows.length > 0) {
                const columns = Object.keys(rows[0]);
                for (const row of rows) {
                    const values = columns.map(c => {
                        const v = row[c];
                        if (v === null) return 'NULL';
                        if (typeof v === 'number') return v;
                        return mysql.escape(String(v));
                    });
                    sql += 'INSERT INTO `' + safeTable + '` (' + columns.map(c => '`' + c.replace(/[^a-zA-Z0-9_]/g, '') + '`').join(', ') + ') VALUES (' + values.join(', ') + ');\n';
                }
                sql += '\n';
            }
        }

        return sql;
    }

    static async exportTable(dbName, tableName) {
        const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        let sql = '-- Export: `' + safeDb + '`.`' + safeTable + '`\n\n';

        const [createTable] = await db.query('SHOW CREATE TABLE `' + safeDb + '`.`' + safeTable + '`');
        sql += 'DROP TABLE IF EXISTS `' + safeTable + '`;\n';
        sql += createTable[0]['Create Table'] + ';\n\n';

        const [rows] = await db.query('SELECT * FROM `' + safeDb + '`.`' + safeTable + '`');
        if (rows.length > 0) {
            const columns = Object.keys(rows[0]);
            for (const row of rows) {
                const values = columns.map(c => {
                    const v = row[c];
                    if (v === null) return 'NULL';
                    if (typeof v === 'number') return v;
                    return mysql.escape(String(v));
                });
                sql += 'INSERT INTO `' + safeTable + '` (' + columns.map(c => '`' + c.replace(/[^a-zA-Z0-9_]/g, '') + '`').join(', ') + ') VALUES (' + values.join(', ') + ');\n';
            }
        }

        return sql;
    }

    static async importSQL(dbName, sqlContent) {
        const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        let executed = 0;
        let errors = [];

        for (const stmt of statements) {
            try {
                if (stmt.toUpperCase().startsWith('USE ')) {
                    await db.query(stmt);
                } else if (stmt.toUpperCase().startsWith('CREATE DATABASE')) {
                    await db.query(stmt);
                } else {
                    await db.query('USE `' + dbName + '`');
                    await db.query(stmt);
                }
                executed++;
            } catch (e) {
                errors.push({ statement: stmt.substring(0, 100), error: e.message });
            }
        }

        return { executed, errors };
    }

    static async listUsers() {
        const [rows] = await db.query("SELECT User, Host FROM mysql.user WHERE User NOT IN ('root','mysql.sys','mysql.session','debian-sys-maint') ORDER BY User");
        return rows;
    }

    static async createUser(username, password, host) {
        const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
        const safeHost = (host || '%').replace(/[^a-zA-Z0-9._%]/g, '');
        if (!safeUser) throw new Error('Invalid username');
        await db.query(`CREATE USER ${mysql.escape(safeUser)}@${mysql.escape(safeHost)} IDENTIFIED BY ${mysql.escape(password)}`);
    }

    static async deleteUser(username, host) {
        await db.query(`DROP USER ${mysql.escape(username)}@${mysql.escape(host || '%')}`);
    }

    static async changePassword(username, host, newPassword) {
        await db.query(`ALTER USER ${mysql.escape(username)}@${mysql.escape(host || '%')} IDENTIFIED BY ${mysql.escape(newPassword)}`);
    }

    static async grantPrivileges(username, database, host) {
        await db.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO ${mysql.escape(username)}@${mysql.escape(host || '%')}`);
        await db.query('FLUSH PRIVILEGES');
    }

    static async revokePrivileges(username, database, host) {
        await db.query(`REVOKE ALL PRIVILEGES ON \`${database}\`.* FROM ${mysql.escape(username)}@${mysql.escape(host || '%')}`);
        await db.query('FLUSH PRIVILEGES');
    }

    static async getUserGrants(username, host) {
        const [rows] = await db.query(`SHOW GRANTS FOR ${mysql.escape(username)}@${mysql.escape(host || '%')}`);
        return rows.map(r => Object.values(r)[0]);
    }

    static formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = DatabaseManagerService;
