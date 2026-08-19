const db = require('../config/db');
const WebsiteService = require('./WebsiteService');
const { execAsync } = require('child_process');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs').promises;

const OLS_VHOSTS = '/usr/local/lsws/conf/vhosts';

class SubdomainService {

    static async list(websiteId) {
        const [rows] = await db.execute('SELECT * FROM subdomains WHERE website_id = ? ORDER BY created_at DESC', [websiteId]);
        return rows;
    }

    static async create(websiteId, subdomain, targetFolder, documentRoot) {
        const fullDomain = subdomain;
        const subdomainPath = `${documentRoot}/${targetFolder}`;

        await fs.mkdir(subdomainPath, { recursive: true });

        await db.execute(
            'INSERT INTO subdomains (website_id, subdomain, target_folder, document_root, status) VALUES (?, ?, ?, ?, ?)',
            [websiteId, fullDomain, targetFolder, subdomainPath, 'active']
        );

        try {
            const website = await WebsiteService.findById(websiteId);
            if (website) {
                await WebsiteService.create(fullDomain, subdomainPath);
            }
        } catch (e) {
            console.error('OLS subdomain config error:', e.message);
        }

        return true;
    }

    static async remove(id) {
        const [rows] = await db.execute('SELECT * FROM subdomains WHERE id = ?', [id]);
        if (rows.length === 0) throw new Error('Subdomain not found');

        const sub = rows[0];
        try {
            await WebsiteService.delete(sub.subdomain);
        } catch (e) {}

        await db.execute('DELETE FROM subdomains WHERE id = ?', [id]);
        return true;
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM subdomains WHERE id = ?', [id]);
        return rows[0] || null;
    }

    static async countByWebsite(websiteId) {
        const [rows] = await db.execute('SELECT COUNT(*) as cnt FROM subdomains WHERE website_id = ?', [websiteId]);
        return rows[0].cnt;
    }
}

module.exports = SubdomainService;
