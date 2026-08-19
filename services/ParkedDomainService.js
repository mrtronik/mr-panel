const db = require('../config/db');
const WebsiteService = require('./WebsiteService');

class ParkedDomainService {

    static async list(websiteId) {
        const [rows] = await db.execute('SELECT * FROM parked_domains WHERE website_id = ? ORDER BY created_at DESC', [websiteId]);
        return rows;
    }

    static async listAll(user) {
        if (!user || user.role === 'admin') {
            const [rows] = await db.execute('SELECT pd.*, w.domain as main_domain FROM parked_domains pd LEFT JOIN websites w ON pd.website_id = w.id ORDER BY pd.created_at DESC');
            return rows;
        }
        if (user.role === 'reseller') {
            const [rows] = await db.execute(
                'SELECT pd.*, w.domain as main_domain FROM parked_domains pd LEFT JOIN websites w ON pd.website_id = w.id WHERE w.user_id = ? OR w.user_id IN (SELECT id FROM users WHERE owner_id = ?) ORDER BY pd.created_at DESC',
                [user.id, user.id]
            );
            return rows;
        }
        const [rows] = await db.execute(
            'SELECT pd.*, w.domain as main_domain FROM parked_domains pd LEFT JOIN websites w ON pd.website_id = w.id WHERE w.user_id = ? ORDER BY pd.created_at DESC',
            [user.id]
        );
        return rows;
    }

    static async create(websiteId, parkedDomain) {
        const safeDomain = parkedDomain.replace(/[^a-zA-Z0-9.-]/g, '');
        await db.execute(
            'INSERT INTO parked_domains (website_id, parked_domain, status) VALUES (?, ?, ?)',
            [websiteId, safeDomain, 'active']
        );
        return true;
    }

    static async remove(id) {
        await db.execute('DELETE FROM parked_domains WHERE id = ?', [id]);
        return true;
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM parked_domains WHERE id = ?', [id]);
        return rows[0] || null;
    }
}

module.exports = ParkedDomainService;
