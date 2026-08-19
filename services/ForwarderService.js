const db = require('../config/db');

class ForwarderService {

    static async list(user) {
        if (!user || user.role === 'admin') {
            const [rows] = await db.execute(
                'SELECT f.*, ea.email as source_email FROM forwarders f LEFT JOIN email_accounts ea ON f.email_account_id = ea.id ORDER BY f.created_at DESC'
            );
            return rows;
        }
        if (user.role === 'reseller') {
            const [rows] = await db.execute(
                'SELECT f.*, ea.email as source_email FROM forwarders f LEFT JOIN email_accounts ea ON f.email_account_id = ea.id WHERE ea.user_id = ? OR ea.user_id IN (SELECT id FROM users WHERE owner_id = ?) ORDER BY f.created_at DESC',
                [user.id, user.id]
            );
            return rows;
        }
        const [rows] = await db.execute(
            'SELECT f.*, ea.email as source_email FROM forwarders f LEFT JOIN email_accounts ea ON f.email_account_id = ea.id WHERE ea.user_id = ? ORDER BY f.created_at DESC',
            [user.id]
        );
        return rows;
    }

    static async create(emailAccountId, destination) {
        const safeDest = destination.replace(/[^a-zA-Z0-9.@_-]/g, '');
        await db.execute(
            'INSERT INTO forwarders (email_account_id, destination, status) VALUES (?, ?, ?)',
            [emailAccountId, safeDest, 'active']
        );
        return true;
    }

    static async remove(id) {
        await db.execute('DELETE FROM forwarders WHERE id = ?', [id]);
        return true;
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM forwarders WHERE id = ?', [id]);
        return rows[0] || null;
    }

    static async listEmailAccounts(user) {
        if (!user || user.role === 'admin') {
            const [rows] = await db.execute('SELECT id, email FROM email_accounts ORDER BY email');
            return rows;
        }
        if (user.role === 'reseller') {
            const [rows] = await db.execute(
                'SELECT id, email FROM email_accounts WHERE user_id = ? OR user_id IN (SELECT id FROM users WHERE owner_id = ?) ORDER BY email',
                [user.id, user.id]
            );
            return rows;
        }
        const [rows] = await db.execute('SELECT id, email FROM email_accounts WHERE user_id = ? ORDER BY email', [user.id]);
        return rows;
    }
}

module.exports = ForwarderService;
