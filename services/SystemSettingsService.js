const db = require('../config/db');

class SystemSettingsService {

    static async get(key, envFallback = null) {
        const [rows] = await db.query('SELECT value FROM settings WHERE `key` = ?', [key]);
        if (rows.length > 0 && rows[0].value !== null && rows[0].value !== '') {
            return rows[0].value;
        }
        return envFallback;
    }

    static async getAll() {
        const [rows] = await db.query('SELECT `key`, value FROM settings');
        const settings = {};
        rows.forEach(r => { settings[r.key] = r.value; });
        return settings;
    }

    static async set(key, value) {
        await db.query(
            'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
            [key, value, value]
        );
    }

    static async setMultiple(obj) {
        for (const [key, value] of Object.entries(obj)) {
            await this.set(key, value);
        }
    }

    static async getAppName() {
        return this.get('app_name', 'MR Panel');
    }

    static async getAppUrl() {
        return this.get('app_url', process.env.APP_URL || 'http://103.191.63.147:1708');
    }

    static async getServerIp() {
        return this.get('server_ip', '103.191.63.147');
    }

    static async getNs1() {
        return this.get('ns1', 'ns1.example.com');
    }

    static async getNs2() {
        return this.get('ns2', 'ns2.example.com');
    }

    static async getWhmcsApiKey() {
        return this.get('whmcs_api_key', process.env.WHMCS_API_KEY || '');
    }

    static async getWhmcsApiSecret() {
        return this.get('whmcs_api_secret', process.env.WHMCS_API_SECRET || '');
    }

    static async getWhmcsJwtSecret() {
        return this.get('whmcs_jwt_secret', process.env.WHMCS_JWT_SECRET || 'mrpanel-whmcs-jwt-secret-2024');
    }

    static async getPanelDomain() {
        return this.get('panel_domain', '');
    }

    static async getPanelSslEnabled() {
        const val = await this.get('panel_https_enabled', 'false');
        return val === 'true' || val === '1';
    }

    static async enablePanelSsl(domain) {
        await this.set('panel_domain', domain);
        await this.set('panel_https_enabled', 'true');
        await this.set('app_url', `https://${domain}:1708`);
    }

    static async disablePanelSsl() {
        await this.set('panel_https_enabled', 'false');
    }
}

module.exports = SystemSettingsService;
