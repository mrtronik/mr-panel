const db = require('../config/db');

module.exports = async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        const [rows] = await db.execute(
            'SELECT id, name, username, email, role, status, package_id, home_dir, disk_used FROM users WHERE id = ?',
            [req.session.user.id]
        );
        if (rows.length > 0) {
            if (rows[0].status === 'suspended') {
                req.session.destroy(() => {
                    return res.redirect('/login');
                });
                return;
            }
            req.session.user = rows[0];
        } else {
            req.session.destroy(() => {
                return res.redirect('/login');
            });
            return;
        }
    } catch (err) {
        console.error('Session refresh error:', err.message);
    }

    next();
};
