const db = require('../config/db');
const CacheService = require('../services/CacheService');

const CacheController = {

    // ─── Auth: validate API key ─────────────────

    async auth(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const apiKey = req.headers['x-api-key'];

            if (!domain || !apiKey) {
                return res.status(401).json({ error: 'Missing domain or API key' });
            }

            const [rows] = await db.execute(
                'SELECT id, domain, cache_api_key FROM websites WHERE domain = ?',
                [domain]
            );

            if (!rows[0]) {
                return res.status(404).json({ error: 'Website not found' });
            }

            if (rows[0].cache_api_key !== apiKey) {
                return res.status(403).json({ error: 'Invalid API key' });
            }

            return res.json({ connected: true, version: '1.0.0' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    // ─── Dashboard ──────────────────────────────

    async dashboard(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const data = await CacheService.getDashboard(domain);
            return res.json(data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    // ─── Page Cache ─────────────────────────────

    async getPageCache(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const settings = await CacheService.getSettings(domain);
            return res.json(settings.page_cache);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    async updatePageCache(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const settings = await CacheService.saveSettings(domain, { page_cache: req.body });
            await CacheService.applyPageCache(domain, settings);
            return res.json({ success: true, settings: settings.page_cache });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    // ─── Browser Cache ──────────────────────────

    async getBrowserCache(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const settings = await CacheService.getSettings(domain);
            return res.json(settings.browser_cache);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    async updateBrowserCache(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const settings = await CacheService.saveSettings(domain, { browser_cache: req.body });
            await CacheService.applyBrowserCache(domain, settings);
            return res.json({ success: true, settings: settings.browser_cache });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    // ─── Object Cache ───────────────────────────

    async getObjectCache(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const settings = await CacheService.getSettings(domain);
            return res.json(settings.object_cache);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    async updateObjectCache(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const settings = await CacheService.saveSettings(domain, { object_cache: req.body });
            return res.json({ success: true, settings: settings.object_cache });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    // ─── PHP Tuning ─────────────────────────────

    async getPhpSettings(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const data = await CacheService.getPhpSettings(domain);
            return res.json(data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    async updatePhpSettings(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const settings = await CacheService.saveSettings(domain, { php_tuning: req.body });
            const result = await CacheService.applyPhpTuning(domain, settings);
            return res.json({ success: true, result, settings: settings.php_tuning });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    // ─── Minify ─────────────────────────────────

    async getMinify(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const settings = await CacheService.getSettings(domain);
            return res.json(settings.minify);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    async updateMinify(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const settings = await CacheService.saveSettings(domain, { minify: req.body });
            return res.json({ success: true, settings: settings.minify });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    // ─── Purge ──────────────────────────────────

    async purge(req, res) {
        try {
            const domain = req.headers['x-domain'];
            const { type = 'all', value = '' } = req.body;
            const result = await CacheService.purgeCache(domain, type, value);
            return res.json(result);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },
};

module.exports = CacheController;
