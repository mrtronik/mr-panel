const db = require('../config/db');

const role = {
    adminOnly(req, res, next) {
        if (!req.session.user || req.session.user.role !== 'admin') {
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ error: 'Akses ditolak' });
            }
            return res.redirect('/dashboard');
        }
        next();
    },

    resellerOnly(req, res, next) {
        if (!req.session.user) {
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            return res.redirect('/login');
        }
        const r = req.session.user.role;
        if (r !== 'admin' && r !== 'reseller') {
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ error: 'Akses ditolak' });
            }
            return res.redirect('/dashboard');
        }
        next();
    },

    anyRole(req, res, next) {
        if (!req.session.user) {
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            return res.redirect('/login');
        }
        next();
    },

    resourceAccess(resourceType) {
        return async (req, res, next) => {
            try {
                const user = req.session.user;
                if (!user) {
                    if (req.path.startsWith('/api/')) {
                        return res.status(401).json({ error: 'Unauthorized' });
                    }
                    return res.redirect('/login');
                }

                if (user.role === 'admin') return next();

                const resourceId = req.params.id;
                let query, params;

                if (resourceType === 'website') {
                    query = 'SELECT user_id FROM websites WHERE id = ?';
                    params = [resourceId];
                } else if (resourceType === 'email') {
                    query = 'SELECT user_id FROM email_accounts WHERE id = ?';
                    params = [resourceId];
                } else {
                    return next();
                }

                const [rows] = await db.execute(query, params);
                if (rows.length === 0) {
                    if (req.path.startsWith('/api/')) {
                        return res.status(404).json({ error: 'Tidak ditemukan' });
                    }
                    return res.redirect('/dashboard');
                }

                const resourceUserId = rows[0].user_id;

                if (resourceUserId === null) return next();

                if (resourceUserId == user.id) return next();

                if (user.role === 'reseller') {
                    const [ownerCheck] = await db.execute(
                        'SELECT id FROM users WHERE id = ? AND owner_id = ?',
                        [resourceUserId, user.id]
                    );
                    if (ownerCheck.length > 0) return next();
                }

                if (req.path.startsWith('/api/')) {
                    return res.status(403).json({ error: 'Akses ditolak' });
                }
                return res.redirect('/dashboard');
            } catch (err) {
                if (req.path.startsWith('/api/')) {
                    return res.status(500).json({ error: err.message });
                }
                return res.redirect('/dashboard');
            }
        };
    },

    getOwnedUserIds(userId, role) {
        if (role === 'admin') return null;
        if (role === 'reseller') return { owner_id: userId };
        return { user_id: userId };
    }
};

module.exports = role;
