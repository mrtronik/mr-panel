const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');

class EmailAccountService {

    static _hashPassword(password) {
        // Use execFileSync to avoid shell injection
        try {
            const hash = execFileSync('openssl', ['passwd', '-6', '-salt', crypto.randomBytes(16).toString('base64').slice(0, 16), password], { encoding: 'utf8', timeout: 5000 }).trim();
            if (hash && hash.startsWith('$')) return hash;
        } catch {}

        // Fallback: Node.js SHA-256
        const salt = crypto.randomBytes(16).toString('base64');
        const hash = crypto.createHash('sha256').update(password + salt).digest('base64');
        return `{SHA256}${salt}:${hash}`;
    }

    static _formatQuota(bytes) {
        if (!bytes || bytes === 0) return 'Unlimited';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // =========================
    // LIST DOMAINS (from websites table, filtered by user)
    // =========================
    static async listDomains(user = null) {
        const domains = new Set();
        try {
            let sql;
            let params = [];
            if (!user || user.role === 'admin') {
                sql = 'SELECT domain FROM websites';
            } else if (user.role === 'reseller') {
                sql = 'SELECT domain FROM websites WHERE user_id IN (SELECT id FROM users WHERE owner_id = ?) OR user_id = ? OR user_id IS NULL';
                params = [user.id, user.id];
            } else {
                sql = 'SELECT domain FROM websites WHERE user_id = ?';
                params = [user.id];
            }
            const [rows] = await db.query(sql, params);
            rows.forEach(r => { if (r.domain) domains.add(r.domain); });
        } catch {}
        return Array.from(domains);
    }

    // =========================
    // LIST ACCOUNTS (filtered by user)
    // =========================
    static async listAccounts(user = null, domain = null) {
        let sql = 'SELECT * FROM email_accounts WHERE status != "deleted"';
        const params = [];

        if (user && user.role !== 'admin') {
            if (user.role === 'reseller') {
                sql += ' AND (user_id IN (SELECT id FROM users WHERE owner_id = ?) OR user_id = ? OR user_id IS NULL)';
                params.push(user.id, user.id);
            } else {
                sql += ' AND user_id = ?';
                params.push(user.id);
            }
        }

        if (domain) {
            sql += ' AND domain = ?';
            params.push(domain);
        }
        sql += ' ORDER BY created_at DESC';
        const [rows] = await db.query(sql, params);
        return rows;
    }

    // =========================
    // CREATE ACCOUNT
    // =========================
    static async createAccount(email, password, domain, quota, userId = null) {
        if (!email || !password) throw new Error('Email and password are required');

        if (!email.includes('@')) {
            email = email + '@' + domain;
        }

        const parts = email.split('@');
        if (parts.length !== 2 || !parts[1]) throw new Error('Invalid email format');

        const [existing] = await db.query('SELECT id FROM email_accounts WHERE email = ?', [email]);
        if (existing.length > 0) throw new Error('Account already exists');

        const passwordHash = this._hashPassword(password);
        const quotaBytes = quota ? parseInt(quota) : 0;

        await db.query(
            'INSERT INTO email_accounts (email, username, domain, password_hash, quota, status, user_id) VALUES (?, ?, ?, ?, ?, "active", ?)',
            [email, parts[0], parts[1], passwordHash, quotaBytes, userId]
        );

        // Create mailbox directory
        const mailboxBase = '/var/mail/vhosts';
        const mailboxPath = path.join(mailboxBase, parts[1], parts[0]);
        if (!fs.existsSync(mailboxPath)) {
            try {
                execSync(`mkdir -p "${path.join(mailboxPath, 'cur')}" "${path.join(mailboxPath, 'new')}" "${path.join(mailboxPath, 'tmp')}"`);
                execSync(`chown -R mail:mail "${mailboxPath}"`);
            } catch {}
        }

        return { success: true, email };
    }

    // =========================
    // DELETE ACCOUNT
    // =========================
    static async deleteAccount(email) {
        const [result] = await db.query(
            'UPDATE email_accounts SET status = "deleted" WHERE email = ? AND status != "deleted"',
            [email]
        );
        if (result.affectedRows === 0) throw new Error('Account not found');
        return { success: true };
    }

    // =========================
    // CHANGE PASSWORD
    // =========================
    static async changePassword(email, newPassword) {
        if (!email || !newPassword) throw new Error('Email and new password are required');

        const passwordHash = this._hashPassword(newPassword);

        const [result] = await db.query(
            'UPDATE email_accounts SET password_hash = ? WHERE email = ? AND status != "deleted"',
            [passwordHash, email]
        );
        if (result.affectedRows === 0) throw new Error('Account not found');
        return { success: true };
    }

    // =========================
    // TOGGLE ACCOUNT
    // =========================
    static async toggleAccount(email) {
        const [rows] = await db.query('SELECT status FROM email_accounts WHERE email = ? AND status != "deleted"', [email]);
        if (rows.length === 0) throw new Error('Account not found');

        const newStatus = rows[0].status === 'active' ? 'suspended' : 'active';
        await db.query('UPDATE email_accounts SET status = ? WHERE email = ?', [newStatus, email]);
        return { success: true, active: newStatus === 'active' };
    }

    // =========================
    // UPDATE QUOTA
    // =========================
    static async updateQuota(email, quotaBytes) {
        const [result] = await db.query(
            'UPDATE email_accounts SET quota = ? WHERE email = ? AND status != "deleted"',
            [quotaBytes, email]
        );
        if (result.affectedRows === 0) throw new Error('Account not found');
        return { success: true };
    }

    // =========================
    // GET QUOTA (disk usage from mailbox)
    // =========================
    static getQuota(email) {
        try {
            const parts = email.split('@');
            if (parts.length !== 2) return { used: 0, usedFormatted: '0 Bytes' };
            const mailboxPath = path.join('/var/mail/vhosts', parts[1], parts[0]);
            if (!fs.existsSync(mailboxPath)) return { used: 0, usedFormatted: '0 Bytes' };
            const output = execSync(`du -sb "${mailboxPath}" 2>/dev/null || echo "0"`, { encoding: 'utf8' });
            const bytes = parseInt(output.split('\t')[0]) || 0;
            return { used: bytes, usedFormatted: this._formatQuota(bytes) };
        } catch {
            return { used: 0, usedFormatted: '0 Bytes' };
        }
    }

    // =========================
    // GET ACCOUNT INFO
    // =========================
    static async getAccountInfo(email) {
        const [rows] = await db.query('SELECT * FROM email_accounts WHERE email = ? AND status != "deleted"', [email]);
        return rows.length > 0 ? rows[0] : null;
    }

    // =========================
    // GENERATE AUTO-LOGIN TOKEN
    // =========================
    static async generateAutoLoginToken(email) {
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

        // Store token in a simple in-memory map (or use Redis/DB)
        if (!this._autoLoginTokens) this._autoLoginTokens = new Map();
        this._autoLoginTokens.set(token, { email, expires });

        // Cleanup expired tokens
        for (const [key, val] of this._autoLoginTokens) {
            if (val.expires < Date.now()) this._autoLoginTokens.delete(key);
        }

        return token;
    }

    // =========================
    // CONSUME AUTO-LOGIN TOKEN
    // =========================
    static async consumeAutoLoginToken(token) {
        if (!this._autoLoginTokens) return null;
        const data = this._autoLoginTokens.get(token);
        if (!data || data.expires < Date.now()) {
            this._autoLoginTokens.delete(token);
            return null;
        }
        this._autoLoginTokens.delete(token); // one-time use
        return data.email;
    }

    // =========================
    // GET ACCOUNT CREDENTIALS (for IMAP/SMTP)
    // =========================
    static async getAccountCredentials(email) {
        const [rows] = await db.query(
            'SELECT email, password_hash, domain FROM email_accounts WHERE email = ? AND status = "active"',
            [email]
        );
        if (rows.length === 0) return null;
        return rows[0];
    }

    // =========================
    // CHECK ACCESS (can user access this email?)
    // =========================
    static async canAccess(email, user) {
        if (!user) return false;
        if (user.role === 'admin') return true;
        const [rows] = await db.query('SELECT user_id FROM email_accounts WHERE email = ? AND status != "deleted"', [email]);
        if (rows.length === 0) return false;
        const uid = rows[0].user_id;
        if (uid === null) return true;
        if (uid == user.id) return true;
        if (user.role === 'reseller') {
            const [owner] = await db.query('SELECT id FROM users WHERE id = ? AND owner_id = ?', [uid, user.id]);
            return owner.length > 0;
        }
        return false;
    }

    // =========================
    // UPDATE PROFILE (display_name, signature)
    // =========================
    static async updateProfile(email, displayName, signature) {
        const [result] = await db.query(
            'UPDATE email_accounts SET display_name = ?, signature = ? WHERE email = ? AND status != "deleted"',
            [displayName || '', signature || '', email]
        );
        if (result.affectedRows === 0) throw new Error('Account not found');
        return { success: true };
    }

    // =========================
    // GET ACCOUNT INFO (for webmail profile)
    // =========================
    static async getAccountProfile(email) {
        const [rows] = await db.query(
            'SELECT email, display_name, signature FROM email_accounts WHERE email = ? AND status != "deleted"',
            [email]
        );
        if (rows.length === 0) return null;
        return rows[0];
    }
}

module.exports = EmailAccountService;
