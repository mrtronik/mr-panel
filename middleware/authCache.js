const db = require('../config/db');

const authCache = async (req, res, next) => {
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

        req.website = rows[0];
        next();
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

module.exports = authCache;
