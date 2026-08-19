const db = require('../config/db');
const bcrypt = require('bcrypt');
const { execSync } = require('child_process');

class UserService {

    static async createSystemUser(username, password) {
        try {
            const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '');
            try {
                execSync(`id ${safeUsername}`, { stdio: 'ignore' });
                return true;
            } catch (e) {
                // user doesn't exist, create it
            }

            execSync(`useradd -m -d /home/${safeUsername} -s /bin/bash ${safeUsername}`, { stdio: 'ignore' });

            try {
                execSync(`echo '${safeUsername}:${password}' | chpasswd`, { stdio: 'ignore' });
            } catch (e) {
                console.warn('chpasswd failed for', safeUsername);
            }

            return true;
        } catch (err) {
            console.error('createSystemUser error:', err.message);
            return false;
        }
    }

    static async deleteSystemUser(username) {
        try {
            const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '');
            try {
                execSync(`id ${safeUsername}`, { stdio: 'ignore' });
                execSync(`userdel -r -f ${safeUsername}`, { stdio: 'ignore' });
            } catch (e) {
                // user doesn't exist on system, skip
            }
            return true;
        } catch (err) {
            console.error('deleteSystemUser error:', err.message);
            return false;
        }
    }

    static async changeSystemPassword(username, newPassword) {
        try {
            const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '');
            execSync(`echo '${safeUsername}:${newPassword}' | chpasswd`, { stdio: 'ignore' });
            return true;
        } catch (err) {
            console.error('changeSystemPassword error:', err.message);
            return false;
        }
    }

    static async listAll(user = null) {
        if (!user || user.role === 'admin') {
            const [rows] = await db.execute(
                'SELECT u.*, p.name as package_name, p.disk_limit, p.bandwidth_limit FROM users u LEFT JOIN packages p ON u.package_id = p.id ORDER BY u.created_at DESC'
            );
            return rows;
        }
        if (user.role === 'reseller') {
            const [rows] = await db.execute(
                'SELECT u.*, p.name as package_name, p.disk_limit, p.bandwidth_limit FROM users u LEFT JOIN packages p ON u.package_id = p.id WHERE u.owner_id = ? ORDER BY u.created_at DESC',
                [user.id]
            );
            return rows;
        }
        return [];
    }

    static async findById(id) {
        const [rows] = await db.execute(
            'SELECT u.*, p.name as package_name FROM users u LEFT JOIN packages p ON u.package_id = p.id WHERE u.id = ?',
            [id]
        );
        return rows[0] || null;
    }

    static async findByUsername(username) {
        const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        return rows[0] || null;
    }

    static async findByEmail(email) {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0] || null;
    }

    static async create(data) {
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const homeDir = data.home_dir || `/home/${data.username}`;

        const [result] = await db.execute(
            'INSERT INTO users (name, username, email, password, role, status, home_dir, package_id, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [data.name, data.username, data.email, hashedPassword, data.role || 'user', data.status || 'active', homeDir, data.package_id || null, data.owner_id || null]
        );

        if (data.role !== 'admin') {
            await this.createSystemUser(data.username, data.password);
        }

        return result.insertId;
    }

    static async update(id, data) {
        const fields = [];
        const values = [];

        if (data.name) { fields.push('name = ?'); values.push(data.name); }
        if (data.username) { fields.push('username = ?'); values.push(data.username); }
        if (data.email) { fields.push('email = ?'); values.push(data.email); }
        if (data.role) { fields.push('role = ?'); values.push(data.role); }
        if (data.status) { fields.push('status = ?'); values.push(data.status); }
        if (data.package_id !== undefined) { fields.push('package_id = ?'); values.push(data.package_id || null); }
        if (data.password) {
            const hashed = await bcrypt.hash(data.password, 10);
            fields.push('password = ?');
            values.push(hashed);

            const user = await this.findById(id);
            if (user && user.role !== 'admin') {
                await this.changeSystemPassword(user.username, data.password);
            }
        }

        if (fields.length === 0) return false;

        values.push(id);
        await db.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
        return true;
    }

    static async delete(id) {
        const user = await this.findById(id);
        if (user && user.role !== 'admin') {
            await this.deleteSystemUser(user.username);
        }
        await db.execute('DELETE FROM users WHERE id = ? AND role != "admin"', [id]);
        return true;
    }

    static async updateLastLogin(id) {
        await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [id]);
    }

    static async countByRole(role) {
        const [rows] = await db.execute('SELECT COUNT(*) as cnt FROM users WHERE role = ?', [role]);
        return rows[0].cnt;
    }

    static async listPackages(user = null) {
        if (!user || user.role === 'admin') {
            const [rows] = await db.execute('SELECT * FROM packages WHERE owner_id IS NULL ORDER BY price ASC');
            return rows;
        }
        const [rows] = await db.execute(
            'SELECT * FROM packages WHERE owner_id = ? ORDER BY price ASC',
            [user.id]
        );
        return rows;
    }

    static async findPackage(id) {
        const [rows] = await db.execute('SELECT * FROM packages WHERE id = ?', [id]);
        return rows[0] || null;
    }

    static async createPackage(data) {
        const [result] = await db.execute(
            'INSERT INTO packages (name, disk_limit, bandwidth_limit, max_domains, max_email, max_database, price, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [data.name, data.disk_limit || 1073741824, data.bandwidth_limit || 10737418240, data.max_domains || 10, data.max_email || 10, data.max_database || 10, data.price || 0, data.owner_id || null]
        );
        return result.insertId;
    }

    static async updatePackage(id, data) {
        const fields = [];
        const values = [];

        if (data.name) { fields.push('name = ?'); values.push(data.name); }
        if (data.disk_limit !== undefined) { fields.push('disk_limit = ?'); values.push(data.disk_limit); }
        if (data.bandwidth_limit !== undefined) { fields.push('bandwidth_limit = ?'); values.push(data.bandwidth_limit); }
        if (data.max_domains !== undefined) { fields.push('max_domains = ?'); values.push(data.max_domains); }
        if (data.max_email !== undefined) { fields.push('max_email = ?'); values.push(data.max_email); }
        if (data.max_database !== undefined) { fields.push('max_database = ?'); values.push(data.max_database); }
        if (data.price !== undefined) { fields.push('price = ?'); values.push(data.price); }
        if (data.status) { fields.push('status = ?'); values.push(data.status); }

        if (fields.length === 0) return false;

        values.push(id);
        await db.execute(`UPDATE packages SET ${fields.join(', ')} WHERE id = ?`, values);
        return true;
    }

    static async deletePackage(id) {
        const [users] = await db.execute('SELECT COUNT(*) as cnt FROM users WHERE package_id = ?', [id]);
        if (users[0].cnt > 0) {
            throw new Error('Package is still in use by users');
        }
        await db.execute('DELETE FROM packages WHERE id = ?', [id]);
        return true;
    }

    static formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = UserService;
