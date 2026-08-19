const db = require('../config/db');

class SettingsService {

    static async get(key) {
        const [rows] = await db.query('SELECT value FROM settings WHERE `key` = ?', [key]);
        return rows.length > 0 ? rows[0].value : null;
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
}

module.exports = SettingsService;
