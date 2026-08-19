const db = require('../config/db');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class WhmcsService {

    static async createAccount({ username, password, email, firstname, lastname, domain, disk_quota, bandwidth_quota }) {
        // Create system user
        const userId = await this.createSystemUser(username, password, email, firstname, lastname);

        // Create website
        const docRoot = `/home/${username}/public_html`;
        fs.mkdirSync(docRoot, { recursive: true });

        const [result] = await db.execute(
            `INSERT INTO websites (user_id, domain, document_root, disk_quota, bandwidth_quota, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', NOW())`,
            [userId, domain, docRoot, disk_quota || 1024, bandwidth_quota || 10240]
        );

        // Create DNS zone
        try {
            const DnsService = require('./DnsService');
            await DnsService.createZone(domain, userId);
        } catch (e) {
            console.error('[WHMCS] DNS zone creation failed:', e.message);
        }

        // Create database user
        try {
            const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
            await db.query(`CREATE USER IF NOT EXISTS ${require('mysql2').escape(safeUser)}@'localhost' IDENTIFIED BY ${require('mysql2').escape(password)}`);
        } catch (e) {
            console.error('[WHMCS] DB user creation failed:', e.message);
        }

        return { success: true, website_id: result.insertId, user_id: userId };
    }

    static async terminateAccount(domain) {
        const [rows] = await db.execute('SELECT * FROM websites WHERE domain = ?', [domain]);
        if (rows.length === 0) return { success: false, error: 'Website not found' };

        const site = rows[0];

        try {
            const DnsService = require('./DnsService');
            await DnsService.deleteZone(site.domain);
        } catch (e) {}

        await db.execute('DELETE FROM websites WHERE id = ?', [site.id]);

        // Delete user home directory: /home/username/public_html → /home/username
        try {
            const homeDir = path.dirname(site.document_root);
            execSync(`rm -rf "${homeDir}"`, { timeout: 30000 });
        } catch (e) {}

        return { success: true };
    }

    static async suspendAccount(domain) {
        const [rows] = await db.execute('SELECT * FROM websites WHERE domain = ?', [domain]);
        if (rows.length === 0) return { success: false, error: 'Website not found' };
        const websiteId = rows[0].id;
        await db.execute("UPDATE websites SET status = 'suspended' WHERE id = ?", [websiteId]);
        try {
            const docRoot = rows[0].document_root;
            if (fs.existsSync(docRoot)) {
                fs.renameSync(docRoot, docRoot + '_suspended');
            }
        } catch (e) {}
        return { success: true };
    }

    static async unsuspendAccount(domain) {
        const [rows] = await db.execute('SELECT * FROM websites WHERE domain = ?', [domain]);
        if (rows.length === 0) return { success: false, error: 'Website not found' };
        const websiteId = rows[0].id;
        await db.execute("UPDATE websites SET status = 'active' WHERE id = ?", [websiteId]);
        try {
            const docRoot = rows[0].document_root;
            const suspended = docRoot + '_suspended';
            if (fs.existsSync(suspended)) {
                fs.renameSync(suspended, docRoot);
            }
        } catch (e) {}
        return { success: true };
    }

    static async changePassword(domain, newPassword) {
        const [rows] = await db.execute('SELECT * FROM websites WHERE domain = ?', [domain]);
        if (rows.length === 0) return { success: false, error: 'Website not found' };

        const username = path.basename(rows[0].document_root);
        try {
            execSync(`echo "${username}:${newPassword}" | chpasswd`, { timeout: 5000 });
        } catch (e) {}

        try {
            const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
            await db.query(`ALTER USER ${require('mysql2').escape(safeUser)}@'localhost' IDENTIFIED BY ${require('mysql2').escape(newPassword)}`);
        } catch (e) {}

        return { success: true };
    }

    static async changePackage(domain, { disk_quota, bandwidth_quota }) {
        const updates = [];
        const params = [];
        if (disk_quota) { updates.push('disk_quota = ?'); params.push(disk_quota); }
        if (bandwidth_quota) { updates.push('bandwidth_quota = ?'); params.push(bandwidth_quota); }
        if (updates.length === 0) return { success: true };
        params.push(domain);
        await db.execute(`UPDATE websites SET ${updates.join(', ')} WHERE domain = ?`, params);
        return { success: true };
    }

    static async getUsage(websiteId) {
        const [rows] = await db.execute('SELECT document_root FROM websites WHERE id = ?', [websiteId]);
        if (rows.length === 0) return { success: false, error: 'Website not found' };

        const docRoot = rows[0].document_root;
        let diskUsage = 0;
        try {
            const output = execSync(`du -sb "${docRoot}" 2>/dev/null`, { encoding: 'utf8' });
            diskUsage = parseInt(output.split('\t')[0]) || 0;
        } catch (e) {}

        return { success: true, usage: { disk: diskUsage, bandwidth: 0 } };
    }

    static async generateSSO({ username, role, client_id, email }) {
        const SystemSettingsService = require('./SystemSettingsService');
        const jwtSecret = await SystemSettingsService.getWhmcsJwtSecret();
        const appUrl = await SystemSettingsService.getAppUrl();

        const token = jwt.sign({
            username: username || 'whmcs_user',
            role: role || 'user',
            client_id: client_id,
            email: email,
            exp: Math.floor(Date.now() / 1000) + 3600
        }, jwtSecret);

        const url = `${appUrl}/auth/whmcs?token=${token}`;
        return { success: true, url };
    }

    static async createSystemUser(username, password, email, firstname, lastname) {
        const fullName = [firstname, lastname].filter(Boolean).join(' ') || username;
        const [result] = await db.execute(
            `INSERT INTO users (username, email, password, name, role, status, created_at) VALUES (?, ?, ?, ?, 'user', 'active', NOW())`,
            [username, email || `${username}@placeholder.com`, password, fullName]
        );
        return result.insertId;
    }
}

module.exports = WhmcsService;
