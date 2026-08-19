const db = require('../config/db');

class ActivityLogService {

    static cleanIp(ip) {
        if (!ip) return null;
        if (ip.startsWith('::ffff:')) return ip.substring(7);
        if (ip === '::1') return '127.0.0.1';
        return ip;
    }

    static async log(userId, action, targetType = null, targetId = null, details = null, ipAddress = null) {
        try {
            const clean = this.cleanIp(ipAddress);
            await db.execute(
                'INSERT INTO activity_logs (user_id, action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, action, targetType, targetId, details ? JSON.stringify(details) : null, clean]
            );
        } catch (err) {
            console.error('Activity log error:', err.message);
        }
    }

    static async getLogs(filters = {}) {
        let query = `
            SELECT al.*, u.name AS user_name, u.username AS user_username
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
        `;
        const conditions = [];
        const params = [];

        if (filters.user_id) {
            conditions.push('al.user_id = ?');
            params.push(filters.user_id);
        }
        if (filters.action) {
            conditions.push('al.action = ?');
            params.push(filters.action);
        }
        if (filters.target_type) {
            conditions.push('al.target_type = ?');
            params.push(filters.target_type);
        }
        if (filters.search) {
            conditions.push('(u.name LIKE ? OR u.username LIKE ? OR al.action LIKE ? OR al.target_type LIKE ?)');
            const s = `%${filters.search}%`;
            params.push(s, s, s, s);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY al.created_at DESC';

        if (filters.limit) {
            query += ' LIMIT ?';
            params.push(parseInt(filters.limit));
        }
        if (filters.offset) {
            query += ' OFFSET ?';
            params.push(parseInt(filters.offset));
        }

        const [rows] = await db.execute(query, params);
        return rows;
    }

    static async countLogs(filters = {}) {
        let query = 'SELECT COUNT(*) as total FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id';
        const conditions = [];
        const params = [];

        if (filters.user_id) {
            conditions.push('al.user_id = ?');
            params.push(filters.user_id);
        }
        if (filters.action) {
            conditions.push('al.action = ?');
            params.push(filters.action);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const [rows] = await db.execute(query, params);
        return rows[0].total;
    }

    static async deleteOldLogs(days = 90) {
        await db.execute('DELETE FROM activity_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [days]);
    }
}

module.exports = ActivityLogService;
